const normalizeForMatching = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const investmentPattern =
  /\b(?:apl|aplic|aplicacao|resg|resgate)\b(?:\s+\w+){0,2}\s+\b(?:invest|inv|cdb|poupanca)\b/

export const isInvestmentTransaction = (transaction) =>
  investmentPattern.test(normalizeForMatching(`${transaction.description} ${transaction.memo ?? ''}`))

export const isPixTransaction = (transaction) =>
  /\bpix\b/.test(normalizeForMatching(`${transaction.description} ${transaction.memo ?? ''}`))

const sumAmounts = (transactions) =>
  transactions.reduce((total, transaction) => total + transaction.amount, 0)

export const analyzeTransactions = (transactions) => {
  const all = transactions.map((transaction) => ({
    ...transaction,
    isInvestment: isInvestmentTransaction(transaction),
  }))
  const importable = all.filter((transaction) => !transaction.isInvestment)
  const investments = all.filter((transaction) => transaction.isInvestment)
  const inflows = importable.filter((transaction) => transaction.amount > 0)
  const outflows = importable.filter((transaction) => transaction.amount < 0)

  return {
    all,
    importable,
    investments,
    summary: {
      inflows: sumAmounts(inflows),
      outflows: Math.abs(sumAmounts(outflows)),
      net: sumAmounts(importable),
      pixCount: importable.filter(isPixTransaction).length,
    },
  }
}

export const getTransactionsForPreviewMode = (analysis, mode) => {
  if (mode === 'account') {
    return analysis.importable
  }

  if (mode === 'investments') {
    return analysis.investments
  }

  return analysis.all
}
