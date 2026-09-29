/** Literal unordered /model filtering. Run: node --import tsx/esm scripts/verify-model-search.ts */
import assert from 'node:assert/strict'
import { filterModels, recentCatalogModels } from '../src/modelGroups.js'
import { nextModelQueryBoundary, previousModelQueryBoundary } from '../src/screens/modelSearchInput.js'
import { modelPickerRows, moveModelFocus } from '../src/modelPickerRows.js'
import { parseModelFavorites, readModelFavorites, toggleModelFavorite } from '../src/modelFavorites.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
assert.deepEqual(ids('deepseek/deepseek'), ['deepseek-v4'])
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
const refs = [{ provider: 'infron', id: 'qwen-27b' }]
const sections = modelPickerRows(models, providers, refs, [refs[0]!, { provider: 'deepseek', id: 'deepseek-v4' }], '')
assert.deepEqual(sections.filter(row => row.kind === 'heading').map(row => row.key),
  ['heading:favorites', 'heading:recent', 'heading:infron', 'heading:openai', 'heading:deepseek'])
assert.equal(sections.filter(row => row.kind === 'model' && row.model.id === 'qwen-27b').length, 2)
assert.equal(sections.filter(row => row.kind === 'model' && row.section === 'recent' && row.model.id === 'qwen-27b').length, 0)
assert.deepEqual(modelPickerRows(models, providers, refs, [], 'seek deep').filter(row => row.kind === 'model').map(row => row.model.id), ['deepseek-v4'])
assert.deepEqual(modelPickerRows(models, providers, refs, [], 'deep seek').map(row => row.key),
  modelPickerRows(models, providers, refs, [], 'seek deep').map(row => row.key))
assert.equal(modelPickerRows([...models, models[3]!], providers, [], [], 'deep').length, 1)
assert.equal(modelPickerRows(models.filter(model => model.provider !== 'deepseek'), providers,
  [{ provider: 'deepseek', id: 'deepseek-v4' }], [], '').some(row => row.kind === 'model' && row.section === 'favorites'), false)
assert.equal(modelPickerRows(models, providers, [{ provider: 'deepseek', id: 'deepseek-v4' }], [], '')
  .some(row => row.kind === 'model' && row.section === 'favorites' && row.model.id === 'deepseek-v4'), true)
assert.equal(sections[moveModelFocus(sections, -1, 1)]?.kind, 'model')
assert.deepEqual(parseModelFavorites('{"models":[{"provider":"a","id":"b"},{"provider":"a","id":"b"},{}]}'), [{ provider: 'a', id: 'b' }])
const dir = mkdtempSync(join(tmpdir(), 'model-favorites-'))
try {
  const added = toggleModelFavorite([], { provider: 'deepseek', id: 'deepseek-v4' }, dir)
  assert.equal(added.saved, true)
  assert.deepEqual(readModelFavorites(dir), added.favorites)
  assert.deepEqual(toggleModelFavorite(added.favorites, added.favorites[0]!, dir).favorites, [])
  const blocked = join(dir, 'blocked-file')
  writeFileSync(blocked, '')
  const unsaved = toggleModelFavorite([], { provider: 'deepseek', id: 'deepseek-v4' }, blocked)
  assert.equal(unsaved.saved, false)
  assert.deepEqual(unsaved.favorites, added.favorites)
} finally { rmSync(dir, { recursive: true, force: true }) }
console.log('verify-model-search: passed')
