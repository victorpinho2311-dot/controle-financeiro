import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBradescoCreditCardCsv } from './card-csv.js'

const statement = `Data: 21/07/2026 02:07:34\rSituação da Fatura: ABERTA\rTITULAR;;;;3268\rData;Histórico;Valor(US$);Valor(R$);\r18/07;COMPRA NACIONAL;0,00;92,10;\r17/07;ESTORNO;0,00;-62,38;\r31/12;COMPRA FORA;10,00;50,00;\rADICIONAL;;;;2260\rData;Histórico;Valor(US$);Valor(R$);\r18/07;COMPRA ADICIONAL 1/2;0,00;20,00;\rTotal da fatura em Real: ;;;99,72\rResumo das Despesas;Real\r(-)Pagamentos/Créditos:;62,38;\r(+)Despesas locais:;162,10;`

test('interpreta o CSV da fatura Bradesco e usa Valor(R$) com sinal invertido', () => {
  const parsed = parseBradescoCreditCardCsv(`\uFEFF${statement}`)

  assert.equal(parsed.statementDate, '2026-07-21')
  assert.equal(parsed.transactions.length, 4)
  assert.deepEqual(parsed.transactions.map(({ date, amount, rawType }) => ({ date, amount, rawType })), [
    { date: '2026-07-18', amount: -92.1, rawType: 'CARD_PURCHASE' },
    { date: '2026-07-17', amount: 62.38, rawType: 'CARD_CREDIT' },
    { date: '2025-12-31', amount: -50, rawType: 'CARD_PURCHASE' },
    { date: '2026-07-18', amount: -20, rawType: 'CARD_PURCHASE' },
  ])
  assert.equal(parsed.transactions[2].memo, 'Valor original em US$: 10,00')
  assert.deepEqual(parsed.cards, [
    { lastFour: '3268', holderName: 'TITULAR', role: 'primary', transactionCount: 3 },
    { lastFour: '2260', holderName: 'ADICIONAL', role: 'additional', transactionCount: 1 },
  ])
  assert.equal(parsed.transactions[3].cardLastFour, '2260')
  assert.equal(parsed.transactions[3].installmentCurrent, 1)
  assert.equal(parsed.transactions[3].installmentTotal, 2)
  assert.equal(parsed.transactions[3].memo, 'Parcela 1 de 2')
  assert.deepEqual(parsed.invoice, {
    status: 'ABERTA',
    reportedTotal: 99.72,
    reportedPurchases: 162.1,
    reportedCredits: 62.38,
    calculatedTotal: 99.72,
    reconciled: true,
  })
})

test('cria FITIDs sintéticos distintos para compras iguais', () => {
  const parsed = parseBradescoCreditCardCsv(`${statement}\r18/07;COMPRA ADICIONAL 1/2;0,00;20,00;`)

  assert.notEqual(parsed.transactions[0].fitid, parsed.transactions.at(-1).fitid)
})
