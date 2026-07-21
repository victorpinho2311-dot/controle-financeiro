const normalizedText = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')

export const suggestCategoryId = (transaction, rules) => {
  const source = normalizedText(`${transaction.description} ${transaction.memo ?? ''}`)

  for (const rule of [...rules].sort((left, right) => right.priority - left.priority)) {
    const pattern = normalizedText(rule.pattern)

    try {
      const matches = rule.is_regex ? new RegExp(pattern, 'i').test(source) : source.includes(pattern)

      if (matches) {
        return rule.category_id
      }
    } catch {
      // Regras inválidas não devem interromper a importação.
    }
  }

  return null
}
