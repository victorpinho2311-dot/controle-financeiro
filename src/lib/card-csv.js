import { OfxParseError } from './ofx.js'

const MAX_FILE_SIZE = 5 * 1024 * 1024

const cleanText = (value) => value?.replace(/\s+/g, ' ').trim() || null

const normalizeForKey = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const parseCsvLine = (line, separator) => {
  const fields = []
  let value = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      insideQuotes = !insideQuotes
    } else if (character === separator && !insideQuotes) {
      fields.push(cleanText(value) ?? '')
      value = ''
    } else {
      value += character
    }
  }

  fields.push(cleanText(value) ?? '')
  return fields
}

const normalizeHeader = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const parseBrazilianAmount = (value) => {
  const normalized = value?.replace(/\./g, '').replace(',', '.').trim()

  if (!normalized || !/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new OfxParseError(`Valor CSV inválido: ${value ?? 'ausente'}.`)
  }

  const amount = Number(normalized)

  if (!Number.isFinite(amount)) {
    throw new OfxParseError(`Valor CSV inválido: ${value}.`)
  }

  return Math.round(amount * 100) / 100
}

const parseStatementDate = (value) => {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)

  if (!match) {
    throw new OfxParseError('Não foi possível identificar a data da fatura do cartão.')
  }

  const [, day, month, year] = match
  return { day: Number(day), month: Number(month), year: Number(year) }
}

const inferTransactionDate = (value, statementDate) => {
  const match = value?.match(/^(\d{2})\/(\d{2})$/)

  if (!match) {
    throw new OfxParseError(`Data CSV inválida: ${value ?? 'ausente'}.`)
  }

  const [, dayValue, monthValue] = match
  const day = Number(dayValue)
  const month = Number(monthValue)
  const year = month > statementDate.month ? statementDate.year - 1 : statementDate.year
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new OfxParseError(`Data CSV inválida: ${value}.`)
  }

  return `${year}-${monthValue}-${dayValue}`
}

const findHeader = (lines) =>
  lines.findIndex((line) => {
    const normalized = normalizeHeader(line)
    return normalized.includes('data') && normalized.includes('historico') && normalized.includes('valorr')
  })

const isTransactionHeader = (line) => {
  const normalized = normalizeHeader(line)
  return normalized.includes('data') && normalized.includes('historico') && normalized.includes('valorr')
}

const parseCardIdentity = (line, separator) => {
  const fields = parseCsvLine(line ?? '', separator)
  const lastFour = [...fields].reverse().find((field) => /^\d{4}$/.test(field)) ?? null

  return {
    holderName: cleanText(fields[0]),
    lastFour,
  }
}

const parseInstallment = (description) => {
  const match = description?.match(/(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})\s*$/)

  if (!match) {
    return null
  }

  const current = Number(match[1])
  const total = Number(match[2])

  if (current < 1 || total < current) {
    return null
  }

  return { current, total }
}

const findSummaryAmount = (lines, separator, expectedLabel) => {
  const line = lines.find((candidate) => {
    const [label] = parseCsvLine(candidate, separator)
    return normalizeHeader(label) === expectedLabel
  })

  if (!line) {
    return null
  }

  const amount = parseCsvLine(line, separator)
    .slice(1)
    .find((value) => /^[+-]?[\d.]+,\d{2}$/.test(value))

  return amount ? parseBrazilianAmount(amount) : null
}

const makeFitid = (transaction, occurrence) =>
  `bradesco-card:${transaction.cardLastFour ?? 'unknown'}:${transaction.date}:${Math.round(transaction.amount * 100)}:${normalizeForKey(transaction.description)}:${occurrence}`

export const parseBradescoCreditCardCsv = (input) => {
  const bytes = typeof input === 'string' ? null : new Uint8Array(input)
  const source = (typeof input === 'string' ? input : new TextDecoder('windows-1252').decode(bytes)).replace(
    /^\uFEFF/,
    '',
  )
  const lines = source.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean)
  const statementDateLine = lines.find((line) => /^Data:\s*\d{2}\/\d{2}\/\d{4}/i.test(line))
  const statementDateValue = statementDateLine?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]
  const statementDate = parseStatementDate(statementDateValue)
  const headerIndex = findHeader(lines)

  if (headerIndex === -1) {
    throw new OfxParseError('O CSV não contém as colunas esperadas da fatura Bradesco.')
  }

  const separator = lines[headerIndex].includes(';') ? ';' : ','
  const header = parseCsvLine(lines[headerIndex], separator).map(normalizeHeader)
  const dateIndex = header.indexOf('data')
  const descriptionIndex = header.indexOf('historico')
  const amountIndex = header.indexOf('valorr')
  const dollarIndex = header.indexOf('valorus')

  if (dateIndex === -1 || descriptionIndex === -1 || amountIndex === -1) {
    throw new OfxParseError('O CSV não contém Data, Histórico e Valor(R$).')
  }

  const warnings = []
  const transactions = []
  const occurrences = new Map()
  const cards = new Map()
  let currentCard = null
  const statusLine = lines.find((line) => normalizeHeader(line).startsWith('situacaodafatura'))
  const status = cleanText(statusLine?.split(':').slice(1).join(':'))?.toUpperCase() ?? null

  lines.slice(headerIndex).forEach((line, relativeIndex) => {
    const absoluteIndex = headerIndex + relativeIndex

    if (isTransactionHeader(line)) {
      currentCard = parseCardIdentity(lines[absoluteIndex - 1], separator)
      return
    }

    const fields = parseCsvLine(line, separator)

    if (!/^\d{2}\/\d{2}$/.test(fields[dateIndex] ?? '')) {
      return
    }

    try {
      const date = inferTransactionDate(fields[dateIndex], statementDate)
      const description = cleanText(fields[descriptionIndex])

      if (!description) {
        throw new OfxParseError(`Lançamento de ${fields[dateIndex]} sem histórico.`)
      }

      if (!currentCard?.lastFour) {
        throw new OfxParseError(
          `Não foi possível identificar o final do cartão para o lançamento de ${fields[dateIndex]}.`,
        )
      }

      const statementAmount = parseBrazilianAmount(fields[amountIndex])
      const amount = -statementAmount
      const dollarAmount = dollarIndex === -1 ? 0 : parseBrazilianAmount(fields[dollarIndex])
      const installment = parseInstallment(description)
      const memoParts = []

      if (dollarAmount !== 0) {
        memoParts.push(`Valor original em US$: ${fields[dollarIndex]}`)
      }

      if (installment) {
        memoParts.push(`Parcela ${installment.current} de ${installment.total}`)
      }

      const memo = memoParts.join(' · ') || null
      const baseKey = `${date}:${Math.round(amount * 100)}:${normalizeForKey(description)}`
      const occurrence = (occurrences.get(baseKey) ?? 0) + 1
      occurrences.set(baseKey, occurrence)
      const transaction = {
        date,
        amount,
        description,
        memo,
        rawType: amount < 0 ? 'CARD_PURCHASE' : 'CARD_CREDIT',
        cardLastFour: currentCard.lastFour,
        cardHolderName: currentCard.holderName,
        installmentCurrent: installment?.current ?? null,
        installmentTotal: installment?.total ?? null,
      }

      transactions.push({
        ...transaction,
        fitid: makeFitid(transaction, occurrence),
      })

      const card = cards.get(currentCard.lastFour) ?? {
        lastFour: currentCard.lastFour,
        holderName: currentCard.holderName,
        role: cards.size === 0 ? 'primary' : 'additional',
        transactionCount: 0,
      }
      card.transactionCount += 1
      cards.set(currentCard.lastFour, card)
    } catch (error) {
      warnings.push(error.message)
    }
  })

  const dates = transactions.map((transaction) => transaction.date).sort()
  const purchases = Math.abs(
    transactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0),
  )
  const credits = transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0)
  const calculatedTotal = Math.round((purchases - credits) * 100) / 100
  const reportedTotal = findSummaryAmount(lines, separator, 'totaldafaturaemreal')
  const reportedPurchases = findSummaryAmount(lines, separator, 'despesaslocais')
  const reportedCredits = findSummaryAmount(lines, separator, 'pagamentoscreditos')

  return {
    accountNumber: null,
    currency: 'BRL',
    periodStart: dates[0] ?? null,
    periodEnd: dates.at(-1) ?? null,
    statementDate: `${statementDate.year}-${String(statementDate.month).padStart(2, '0')}-${String(statementDate.day).padStart(2, '0')}`,
    cards: [...cards.values()],
    invoice: {
      status,
      reportedTotal,
      reportedPurchases,
      reportedCredits,
      calculatedTotal,
      reconciled: reportedTotal === null || Math.abs(reportedTotal - calculatedTotal) < 0.01,
    },
    transactions,
    warnings,
  }
}

export const parseBradescoCreditCardCsvFile = async (file) => {
  if (!file) {
    throw new OfxParseError('Selecione o CSV da fatura.')
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new OfxParseError('O CSV da fatura deve ter no máximo 5 MB.')
  }

  return parseBradescoCreditCardCsv(await file.arrayBuffer())
}
