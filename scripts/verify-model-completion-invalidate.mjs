/**
 * /model completion preserves search text while the dialog reads the live
 * catalog after provider changes. Run: node scripts/verify-model-completion-invalidate.mjs
 */
import assert from 'node:assert/strict'
import { createChannel } from '../lib/types/dsh-adapter/channel.js'

let providerCatalog = [
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'my-gateway', name: 'My Gateway' },
]
const llmStub = {
  listProviders: () => [...providerCatalog],
  listModels(provider) {
    if (provider === 'deepseek') return Promise.resolve([{ provider, id: 'ds-1', name: 'DeepSeek 1' }])
    if (provider === 'my-gateway') return Promise.resolve([{ provider, id: 'gw-1', name: 'Gateway 1' }])
    return Promise.resolve([])
  },
}
const channel = createChannel({
  on: () => () => {},
  get: service => service === 'llm' ? llmStub : undefined,
  logger: { warn() {} },
}, {
  id: 'a1', status: 'idle', session: { id: 's1', seq: 0, events: [] , snapshotEvents() { return this.events }},
  ctx: { on: () => () => {} }, followup() {}, steer() {},
  inbox: { remove() { return true } },
}, { model: 'deepseek-chat', cwd: '/tmp', provider: 'deepseek', activity: false })

assert.deepEqual((await channel.listModels()).map(model => `${model.provider}/${model.id}`), ['deepseek/ds-1', 'my-gateway/gw-1'])
for (const input of ['/model ', '/model seek deep', '/model my-gateway/gw-1']) {
  const [completion] = channel.commandCompletions(input)
  assert.equal(completion?.replacement, input)
  assert.equal(completion?.commandLine, input)
}
providerCatalog = providerCatalog.filter(provider => provider.id !== 'my-gateway')
channel.invalidateModelCompletion()
assert.deepEqual((await channel.listModels()).map(model => `${model.provider}/${model.id}`), ['deepseek/ds-1'])
assert.equal(channel.commandCompletions('/model my-gateway/gw-1')[0]?.replacement, '/model my-gateway/gw-1')
console.log('verify-model-completion-invalidate: live catalog and search completion passed')
