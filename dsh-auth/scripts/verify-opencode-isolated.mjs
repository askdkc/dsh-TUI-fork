import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply, CredentialFile, OpenCodeAdapter } from '../lib/index.js'
const directory = await mkdtemp(join(tmpdir(), 'dsh-no-pi-'))
const previousHome = process.env.DSH_HOME; process.env.DSH_HOME = directory
const previousFetch = globalThis.fetch
globalThis.fetch = async url => {
  if (!String(url).endsWith('/messages')) throw new Error('Unexpected network request in isolated test')
  const events = [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'pi-free' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const holder = {}; const adapters = new Map(); const effects = []
try {
  await apply({
    get: name => name === 'dshAuth' ? holder : name === 'llm' ? { registerAdapter: ([id], adapter) => { adapters.set(id, adapter); return () => adapters.delete(id) } } : undefined,
    logger: { warn() {}, error(message) { throw new Error(message) } },
    effect: callback => { const effect = callback(); const drain = effect.next().value; effects.push(async () => { await drain(); effect.next().value() }) },
  }, { providers: ['opencode', 'opencode-go'], credentialsFile: join(directory, 'credentials.json') })
  assert.equal(adapters.size, 2)
  assert(adapters.get('opencode') instanceof OpenCodeAdapter)
  assert.equal((await adapters.get('opencode').resolveModel('opencode', 'claude-sonnet-5-5')).id, 'claude-sonnet-5-5')
  assert.equal((await adapters.get('opencode-go').resolveModel('opencode-go', 'gpt-6-luna')).id, 'gpt-6-luna')
  assert.equal((await holder.api.providers()).length, 2)
  assert.equal((await adapters.get('opencode').listModels('opencode')).length, 0)
  const store = new CredentialFile(join(directory, 'credentials.json')); await store.modify('opencode', async () => ({ type: 'api_key', key: 'fixture-key' }))
  assert((await adapters.get('opencode').listModels('opencode')).length > 0)
  const chunks = []; for await (const chunk of adapters.get('opencode').stream({ provider: 'opencode', model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }] })) chunks.push(chunk)
  assert(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'pi-free'))
  assert.equal(chunks.at(-1).type, 'finish')
  const isolatedHolder = {}; const routesAfterPiFailure = new Map(); const warnings = []
  await apply({
    get: name => name === 'dshAuth' ? isolatedHolder : name === 'llm' ? { registerAdapter: ([id], adapter) => { routesAfterPiFailure.set(id, adapter); return () => routesAfterPiFailure.delete(id) } } : undefined,
    logger: { warn(message) { warnings.push(message) }, error(message) { throw new Error(message) } },
    effect: callback => { const effect = callback(); const drain = effect.next().value; effects.push(async () => { await drain(); effect.next().value() }) },
  }, { providers: ['openai-codex', 'opencode', 'opencode-go'], credentialsFile: store.path })
  assert(warnings.some(message => message.includes('pi routes unavailable')))
  assert.equal(routesAfterPiFailure.size, 2)
  assert.equal((await isolatedHolder.api.providers()).length, 2)
  console.log('OpenCode startup, reported models and wire inference succeed with pi imports forbidden')
} finally { for (const dispose of effects) await dispose(); await rm(directory, { recursive: true, force: true }); globalThis.fetch = previousFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome }
