/** Literal unordered /model filtering. Run: node --import tsx/esm scripts/verify-model-search.ts */
import assert from 'node:assert/strict'
import { filterModels, recentCatalogModels } from '../src/modelGroups.js'
import { nextModelQueryBoundary, previousModelQueryBoundary } from '../src/screens/modelSearchInput.js'

const providers = [{ id: 'infron', name: 'North Cloud' }, { id: 'openai', name: 'OpenAI' }, { id: 'deepseek', name: 'DeepSeek' }]
const models = [
  { provider: 'infron', id: 'qwen-27b', name: 'Qwen 27B', description: 'small' },
  { provider: 'openai', id: 'gpt-5', name: 'GPT Five', description: 'qwen 27b comparison' },
  { provider: 'infron', id: 'glm.5', name: 'GLM 5', description: 'other' },
  { provider: 'deepseek', id: 'deepseek-v4', name: 'DeepSeek V4', description: 'reasoning' },
]
const ids = (query: string) => filterModels(models, query, providers).map(model => model.id)
assert.deepEqual(ids('QWEN 27B'), ['qwen-27b'])
assert.deepEqual(ids('27b qwen'), ['qwen-27b'])
assert.deepEqual(ids('seek deep'), ['deepseek-v4'])
assert.deepEqual(ids('deep seek'), ['deepseek-v4'])
assert.deepEqual(ids('OPENAI gpt'), ['gpt-5'])
assert.deepEqual(ids('infron glm'), ['glm.5'])
assert.deepEqual(ids('cloud qwen'), ['qwen-27b'])
assert.deepEqual(ids('.'), ['glm.5'])
assert.deepEqual(ids('comparison'), [])
assert.deepEqual(ids('not-here'), [])
assert.deepEqual(ids('   '), models.map(model => model.id))
const recents = recentCatalogModels([{ provider: 'infron', id: 'glm.5' }], models)
assert.deepEqual(filterModels(recents, 'qwen', providers), [])
assert.deepEqual(filterModels(models.filter(model => model.provider === 'infron'), 'gpt', providers), [])
const unicodeQuery = 'a👩‍💻éb'
assert.equal(nextModelQueryBoundary(unicodeQuery, 1), 6)
assert.equal(previousModelQueryBoundary(unicodeQuery, 6), 1)
assert.equal(nextModelQueryBoundary(unicodeQuery, 6), 8)
assert.equal(previousModelQueryBoundary(unicodeQuery, 8), 6)
console.log('verify-model-search: passed')
