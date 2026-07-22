import assert from 'node:assert/strict'
import test from 'node:test'
import { OfxParseError, decodeOfx, parseOfx } from './ofx.js'

const ofxSgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<ACCTID>12345-6
<BANKTRANLIST>
<DTSTART>20260701
<DTEND>20260720
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260710[-3:BRT]
<TRNAMT>-1.234,56
<FITID>bradesco-001
<NAME>PADARIA PÃO
<MEMO>CAFÉ &amp; PÃO
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260711
<TRNAMT>2500.00
<FITID>bradesco-002
<NAME>SALÁRIO
<LEDGERBAL>
<BALAMT>1.234,56
<DTASOF>20260720
<BANKTRANLIST>
<STMTRS>
<STMTTRNRS>
<BANKMSGSRSV1>
<OFX>`

test('interpreta OFX SGML em Windows-1252 e normaliza os lançamentos', () => {
  const bytes = Buffer.from(ofxSgml, 'latin1')
  const parsed = parseOfx(bytes)

  assert.equal(parsed.accountNumber, '12345-6')
  assert.equal(parsed.currency, 'BRL')
  assert.equal(parsed.periodStart, '2026-07-01')
  assert.equal(parsed.periodEnd, '2026-07-20')
  assert.equal(parsed.ledgerBalance, 1234.56)
  assert.equal(parsed.ledgerBalanceDate, '2026-07-20')
  assert.deepEqual(parsed.transactions, [
    {
      fitid: 'bradesco-001',
      date: '2026-07-10',
      amount: -1234.56,
      description: 'PADARIA PÃO',
      memo: 'CAFÉ & PÃO',
      rawType: 'DEBIT',
    },
    {
      fitid: 'bradesco-002',
      date: '2026-07-11',
      amount: 2500,
      description: 'SALÁRIO',
      memo: null,
      rawType: 'CREDIT',
    },
  ])
  assert.deepEqual(parsed.warnings, [])
})

test('aceita tags OFX fechadas e preserva a convenção negativa para saída', () => {
  const parsed = parseOfx(`<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260228</DTPOSTED><TRNAMT>-9.99</TRNAMT><FITID>x-1</FITID><NAME>Teste</NAME></STMTTRN></BANKTRANLIST></OFX>`)

  assert.equal(parsed.transactions[0].date, '2026-02-28')
  assert.equal(parsed.transactions[0].amount, -9.99)
  assert.equal(parsed.ledgerBalance, null)
  assert.equal(parsed.ledgerBalanceDate, null)
})

test('descarta um lançamento inválido sem interromper os demais', () => {
  const parsed = parseOfx(`<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260710<TRNAMT>-1<FITID>ok<NAME>Válido<STMTTRN><DTPOSTED>20260711<TRNAMT>-2<NAME>Sem ID</BANKTRANLIST></OFX>`)

  assert.equal(parsed.transactions.length, 1)
  assert.match(parsed.warnings[0], /sem FITID/i)
})

test('recusa arquivos vazios', () => {
  assert.throws(() => parseOfx(''), OfxParseError)
})

test('converte bytes Latin-1 para texto', () => {
  const bytes = Buffer.from('CHARSET:1252\n<OFX><NAME>PÃO', 'latin1')

  assert.match(decodeOfx(bytes), /PÃO/)
})
