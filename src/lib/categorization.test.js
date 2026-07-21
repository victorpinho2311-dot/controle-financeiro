import assert from 'node:assert/strict'
import test from 'node:test'
import { suggestCategoryId } from './categorization.js'

const transaction = (description) => ({ description, memo: null })

test('prioriza a regra de maior prioridade ao sugerir categoria', () => {
  const categoryId = suggestCategoryId(transaction('SUPERMERCADO TAUSTE'), [
    { pattern: 'tauste', is_regex: false, priority: 10, category_id: 'alimentacao' },
    { pattern: 'supermercado tauste', is_regex: false, priority: 100, category_id: 'mercado' },
  ])

  assert.equal(categoryId, 'mercado')
})

test('aceita regras com expressão regular e ignora regras inválidas', () => {
  const categoryId = suggestCategoryId(transaction('IFD*PIZZARIA'), [
    { pattern: '[', is_regex: true, priority: 100, category_id: 'invalida' },
    { pattern: 'ifd|restaurante', is_regex: true, priority: 10, category_id: 'alimentacao' },
  ])

  assert.equal(categoryId, 'alimentacao')
})
