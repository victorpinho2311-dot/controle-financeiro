const MAX_OFX_FILE_SIZE = 5 * 1024 * 1024

export class OfxParseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'OfxParseError'
  }
}

const cleanText = (value) =>
  value
    ?.replaceAll(String.fromCodePoint(0), '')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, entity) => {
      const codePoint = entity.startsWith('x')
        ? Number.parseInt(entity.slice(1), 16)
        : Number.parseInt(entity, 10)

      return Number.isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : ''
    })
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim() ?? null

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractTag = (source, tag) => {
  const safeTag = escapeRegExp(tag)
  const closedTag = new RegExp(
    `<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag}\\s*>`,
    'i',
  )
  const closedMatch = source.match(closedTag)

  if (closedMatch) {
    return cleanText(closedMatch[1])
  }

  const sgmlTag = new RegExp(
    `<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)(?=<\\/?[a-z][a-z0-9_.:-]*(?:\\s[^>]*)?>|$)`,
    'i',
  )

  return cleanText(source.match(sgmlTag)?.[1])
}

const extractTransactionBlocks = (source) => [
  ...source.matchAll(
    /<STMTTRN(?:\s[^>]*)?>([\s\S]*?)(?:<\/STMTTRN\s*>|(?=<STMTTRN(?:\s[^>]*)?>|<\/BANKTRANLIST\s*>|$))/gi,
  ),
].map((match) => match[1])

const normalizeOfxDate = (value) => {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})/)

  if (!match) {
    throw new OfxParseError(`Data OFX inválida: ${value ?? 'ausente'}.`)
  }

  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new OfxParseError(`Data OFX inválida: ${value}.`)
  }

  return `${year}-${month}-${day}`
}

const normalizeOfxAmount = (value) => {
  const compact = value?.replace(/\s/g, '')

  if (!compact) {
    throw new OfxParseError('Valor OFX ausente.')
  }

  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  const normalized =
    lastComma > lastDot
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(/,/g, '')

  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(normalized)) {
    throw new OfxParseError(`Valor OFX inválido: ${value}.`)
  }

  const amount = Number(normalized)

  if (!Number.isFinite(amount)) {
    throw new OfxParseError(`Valor OFX inválido: ${value}.`)
  }

  return Math.round(amount * 100) / 100
}

const charsetFromHeader = (bytes) => {
  const header = new TextDecoder('windows-1252').decode(bytes.slice(0, 4096))
  const charset = header.match(/CHARSET\s*:\s*([^\r\n<]+)/i)?.[1]?.trim().toLowerCase()
  const encoding = header.match(/ENCODING\s*:\s*([^\r\n<]+)/i)?.[1]?.trim().toLowerCase()
  const candidate = charset || encoding

  if (!candidate || candidate === 'usascii' || candidate === 'us-ascii') {
    return 'windows-1252'
  }

  if (candidate === '1252' || candidate === 'cp1252' || candidate === 'windows-1252') {
    return 'windows-1252'
  }

  if (candidate === 'iso-8859-1' || candidate === 'iso8859-1' || candidate === 'latin1') {
    return 'iso-8859-1'
  }

  return candidate
}

export const decodeOfx = (input) => {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input)
  const charset = charsetFromHeader(bytes)

  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const normalizeTransaction = (block, index) => {
  const fitid = extractTag(block, 'FITID')
  const date = normalizeOfxDate(extractTag(block, 'DTPOSTED'))
  const amount = normalizeOfxAmount(extractTag(block, 'TRNAMT'))
  const rawType = extractTag(block, 'TRNTYPE')?.toUpperCase() ?? 'UNKNOWN'
  const name = extractTag(block, 'NAME')
  const memo = extractTag(block, 'MEMO')

  if (!fitid) {
    throw new OfxParseError(`Lançamento ${index + 1} sem FITID.`)
  }

  return {
    fitid,
    date,
    amount,
    description: name || memo || rawType,
    memo,
    rawType,
  }
}

export const parseOfx = (input) => {
  const source = typeof input === 'string' ? input : decodeOfx(input)

  if (!source.trim()) {
    throw new OfxParseError('O arquivo OFX está vazio.')
  }

  const blocks = extractTransactionBlocks(source)
  const transactions = []
  const warnings = []

  blocks.forEach((block, index) => {
    try {
      transactions.push(normalizeTransaction(block, index))
    } catch (error) {
      warnings.push(error.message)
    }
  })

  return {
    accountNumber: extractTag(source, 'ACCTID'),
    currency: extractTag(source, 'CURDEF') ?? 'BRL',
    periodStart: extractTag(source, 'DTSTART')
      ? normalizeOfxDate(extractTag(source, 'DTSTART'))
      : null,
    periodEnd: extractTag(source, 'DTEND') ? normalizeOfxDate(extractTag(source, 'DTEND')) : null,
    transactions,
    warnings,
  }
}

export const parseOfxFile = async (file) => {
  if (!file) {
    throw new OfxParseError('Selecione um arquivo OFX.')
  }

  if (file.size > MAX_OFX_FILE_SIZE) {
    throw new OfxParseError('O arquivo OFX deve ter no máximo 5 MB.')
  }

  return parseOfx(await file.arrayBuffer())
}
