import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeTransactions,
  getTransactionsForPreviewMode,
  isInvestmentTransaction,
} from './transaction-analysis.js'

const transaction = (description, amount, memo = null) => ({
  fitid: description,
  description,
  memo,
  amount,
  date: '2026-06-01',
  rawType: amount < 0 ? 'DEBIT' : 'CREDIT',
})

test('reconhece as variações de investimento presentes no OFX do Bradesco', () => {
  for (const description of [
    'Apl.invest Fac',
    'Aplic.invest Facil',
    'Aplicacao Cdb',
    'Resg.autom.invest Facil*',
    'Resg/vencto Cdb',
    'Resgate Inv Fac',
  ]) {
    assert.equal(isInvestmentTransaction(transaction(description, -10)), true)
  }
})

test('separa investimentos sem excluir PIX e resume apenas movimentações da conta', () => {
  const analysis = analyzeTransactions([
    transaction('Pix recebido', 100),
    transaction('Pix enviado', -40),
    transaction('Aplicacao Cdb', -500),
  ])

  assert.equal(analysis.all.length, 3)
  assert.equal(analysis.importable.length, 2)
  assert.equal(analysis.investments.length, 1)
  assert.deepEqual(analysis.summary, {
    inflows: 100,
    outflows: 40,
    net: 60,
    pixCount: 2,
  })
})

test('seleciona a lista certa para cada aba da prévia', () => {
  const analysis = analyzeTransactions([
    transaction('Pix recebido', 100),
    transaction('Aplicacao Cdb', -500),
  ])

  assert.equal(getTransactionsForPreviewMode(analysis, 'account').length, 1)
  assert.equal(getTransactionsForPreviewMode(analysis, 'investments').length, 1)
  assert.equal(getTransactionsForPreviewMode(analysis, 'all').length, 2)
})

test('deixa lançamentos fora do período declarado fora da importação', () => {
  const analysis = analyzeTransactions(
    [
      transaction('PIX dentro do período', 100),
      { ...transaction('PIX do mês seguinte', -30), date: '2026-07-01' },
    ],
    { periodStart: '2026-06-01', periodEnd: '2026-06-30' },
  )

  assert.equal(analysis.importable.length, 1)
  assert.equal(analysis.outsidePeriod.length, 1)
  assert.deepEqual(analysis.summary, {
    inflows: 100,
    outflows: 0,
    net: 100,
    pixCount: 1,
  })
})
