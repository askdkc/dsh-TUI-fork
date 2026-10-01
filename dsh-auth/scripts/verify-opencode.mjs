import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenCodeCatalog, normalizeCatalog, parseSnapshot, rosterIds, fetchCatalogJson } from '../lib/opencode-catalog.js'
import { OpenCodeAdapter } from '../lib/opencode-adapter.js'
import { CredentialFile } from '../lib/credentials.js'
import { OPEN_CODE_SNAPSHOTS } from '../lib/opencode-owned.generated.js'
import { AssistantStreamAccumulator, expandAssistantStream } from '@deepseek-ai/dsh-llm'
const raw = (npm = '@ai-sdk/openai-compatible') => ({ npm, models: { 'future-model': { name: 'Future', limit: { context: 100000, output: 4000 }, modalities: { input: ['text', 'image'], output: ['text'] }, tool_call: true, reasoning: true, temperature: true, reasoning_options: [{ type: 'effort', values: ['low', 'high'] }] } } })
const snapshot = (route = 'opencode', npm) => normalizeCatalog(route, ['future-model'], raw(npm), Date.now())
const listing = ids => ({ data: ids.map(id => ({ id })) })
const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
test('normalization classifies every id without copying a sibling or another route', () => {
  const result = normalizeCatalog('opencode', ['future-model', 'unknown', 'future-model'], raw(), 1)
  assert.equal(result.models.length, 1); assert.equal(result.excluded[0].id, 'unknown')
  assert.equal(result.models[0].cost, undefined)
  assert.deepEqual(parseSnapshot(result, 'opencode'), result)
  assert.throws(() => parseSnapshot({ ...result, excluded: [] }, 'opencode'))
  assert.throws(() => rosterIds(listing([])))
  assert.throws(() => rosterIds({ data: [{ id: 1 }] }))
})
test('only exact-route missing metadata reuses a verified model; explicit unsupported protocol excludes it', () => {
  const previous = snapshot()
  assert.equal(normalizeCatalog('opencode', ['future-model'], { models: {} }, 2, previous).models.length, 1)
  assert.equal(normalizeCatalog('opencode', ['future-model'], raw('arbitrary-package'), 2, previous).models.length, 0)
})
test('cache startup, single-flight refresh, delisting and failed refresh preserve the verified generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-catalog-')); let calls = 0; let ids = ['future-model']; let fail = false; let changes = 0
  const fetcher = async url => { calls++; if (fail) throw new Error('secret must not reach diagnostic'); return Response.json(String(url).includes('models.dev') ? { opencode: raw() } : listing(ids)) }
  const catalog = new OpenCodeCatalog('opencode', snapshot(), { directory, fetcher, changed: () => changes++ })
  try {
    await catalog.start(); assert.equal(calls, 0)
    await Promise.all([catalog.refresh(), catalog.refresh()]); assert.equal(calls, 2)
    assert.equal(catalog.status().source, 'live'); assert.equal(changes, 1)
    assert.equal(JSON.parse(await readFile(join(directory, 'opencode.json'))).version, 1)
    ids = ['unknown']; await catalog.refresh(); assert.equal(catalog.models().length, 0); assert.equal(catalog.status().excluded.length, 1)
    fail = true; await catalog.refresh(); assert.equal(catalog.status().excluded.length, 1); assert(!catalog.status().warning.includes('secret'))
    catalog.dispose(); await assert.rejects(catalog.refresh(), /disposed/)
    await writeFile(join(directory, 'opencode.json'), '{broken')
    const recovered = new OpenCodeCatalog('opencode', snapshot(), { directory, fetcher }); await recovered.start(); assert.equal(recovered.models().length, 1); assert(recovered.status().warning); recovered.dispose()
  } finally { catalog.dispose(); await rm(directory, { recursive: true, force: true }) }
})
test('Chat Completions future id streams tool arguments, reasoning, usage and owned replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-opencode-')); const store = new CredentialFile(join(directory, 'credentials.json'))
  await store.modify('opencode', async () => ({ type: 'api_key', key: 'fixture-key' }))
  let request
  const fetcher = async (url, init) => {
    request = { url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) }
    return sse([
      { id: 'reply', choices: [{ index: 0, delta: { reasoning_content: 'thinking' }, finish_reason: null }] },
      { id: 'reply', choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: null }] },
      { id: 'reply', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"q":' } }] }, finish_reason: null }] },
      { id: 'reply', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] }, finish_reason: null }] },
      { id: 'reply', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13, prompt_tokens_details: { cached_tokens: 4 } } },
    ])
  }
  const catalog = new OpenCodeCatalog('opencode', snapshot(), { directory })
  const adapter = new OpenCodeAdapter({ catalogs: new Map([['opencode', catalog]]), store, fetcher })
  try {
    const chunks = await collect(adapter.stream({ provider: 'opencode', model: 'future-model', sessionId: 'session-1', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], tools: [{ name: 'search', description: 'search', parameters: { type: 'object' } }] }))
    assert.equal(request.url, 'https://opencode.ai/zen/v1/chat/completions'); assert.equal(request.body.model, 'future-model')
    assert.equal(request.headers.get('authorization'), 'Bearer fixture-key'); assert.equal(request.headers.get('x-opencode-session'), 'session-1'); assert(request.headers.get('user-agent'))
    assert.equal(chunks.filter(chunk => chunk.type === 'tool-call-delta').map(chunk => chunk.argumentsDelta).join(''), '{"q":"x"}')
    assert(chunks.some(chunk => chunk.type === 'reasoning-delta' && chunk.text === 'thinking'))
    const usage = chunks.at(-2); assert.equal(usage.type, 'usage'); assert.equal(usage.usage.inputTokens, 6); assert.equal(usage.usage.cacheReadTokens, 4)
    assert.equal(chunks.at(-1).reason.kind, 'tool-calls'); assert.equal(chunks.at(-1).replayState.response.kind, 'dsh-opencode')
    await store.delete('opencode'); await assert.rejects(async () => { for await (const chunk of adapter.stream({ provider: 'opencode', model: 'future-model', messages: [] })) {} }, /auth login/)
  } finally { catalog.dispose(); await rm(directory, { recursive: true, force: true }) }
})
for (const [npm, suffix, events] of [
  ['@ai-sdk/anthropic', '/messages', [
    { type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model: 'future-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'answer' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ]],
  ['@ai-sdk/openai', '/responses', [
    { type: 'response.created', response: { id: 'resp_fixture', model: 'future-model', created_at: 1 } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_fixture', role: 'assistant', content: [] } },
    { type: 'response.content_part.added', item_id: 'msg_fixture', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: 'msg_fixture', output_index: 0, content_index: 0, delta: 'answer' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_fixture', role: 'assistant', content: [{ type: 'output_text', text: 'answer', annotations: [] }] } },
    { type: 'response.completed', response: { id: 'resp_fixture', model: 'future-model', status: 'completed', usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 0 } } } },
  ]],
  ['@ai-sdk/google', '/models/future-model:streamGenerateContent?alt=sse', [
    { candidates: [{ content: { role: 'model', parts: [{ text: 'answer' }] }, index: 0 }], modelVersion: 'future-model' },
    { candidates: [{ content: { role: 'model', parts: [] }, index: 0, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 13 } },
  ]],
]) for (const route of ['opencode', 'opencode-go']) test(`${route} ${npm} streams an SDK-unknown model using the exact wire endpoint`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-wire-')); const store = new CredentialFile(join(directory, 'credentials.json'))
  await store.modify(route, async () => ({ type: 'api_key', key: 'fixture-key' }))
  let request
  const fetcher = async (url, init) => {
    request = { url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) }
    const body = events.map(event => `${npm === '@ai-sdk/anthropic' ? `event: ${event.type}\n` : ''}data: ${JSON.stringify(event)}\n\n`).join('')
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }
  const catalog = new OpenCodeCatalog(route, snapshot(route, npm), { directory }); const adapter = new OpenCodeAdapter({ catalogs: new Map([[route, catalog]]), store, fetcher })
  try {
    const chunks = await collect(adapter.stream({ provider: route, model: 'future-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }))
    assert.equal(request.url, `https://opencode.ai/zen${route === 'opencode-go' ? '/go' : ''}/v1${suffix}`)
    assert(request.headers.get('x-opencode-session')); assert(request.headers.get('user-agent'))
    assert(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'answer'))
    assert.equal(chunks.at(-1).type, 'finish'); assert.equal(chunks.at(-2).type, 'usage')
  } finally { catalog.dispose(); await rm(directory, { recursive: true, force: true }) }
})

import { encodePrompt } from '../lib/opencode-codec.js'
import { projectReplay } from '../lib/opencode-replay.js'
import { createDshAuthApi } from '../lib/service.js'
import { createAuthCommandHandler } from '../lib/command.js'
async function collect(stream) {
  const accumulator = new AssistantStreamAccumulator()
  const chunks = []
  for await (const chunk of stream) chunks.push(accumulator.push({ time: chunks.length, chunk }).chunk)
  assert.deepEqual(expandAssistantStream(accumulator.snapshot()).map(item => item.chunk), chunks)
  return chunks
}

for (const usage of [undefined, { prompt_tokens: 2, completion_tokens: 1 }, {
  prompt_tokens: 2, completion_tokens: 1,
  prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 },
}]) test(`DeepSeek chat stream persists with optional usage ${JSON.stringify(usage)}`, async () => {
  await environment(undefined, async () => sse([
    { choices: [{ index: 0, delta: { reasoning_content: 'thinking' }, finish_reason: null }] },
    { choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }], ...(usage ? { usage } : {}) },
  ]), async ({ adapter }) => {
    const chunks = await collect(adapter.stream({ provider: 'opencode', model: 'deepseek-v4-flash', messages: [] }))
    const tokens = chunks.find(chunk => chunk.type === 'usage').usage
    const response = chunks.at(-1).replayState.response
    assert.equal(Object.hasOwn(response, 'responseId'), false)
    assert.equal(Object.hasOwn(tokens, 'cacheWriteTokens'), false)
    // The compatible SDK supplies zero cache/reasoning counts when usage is present.
    assert.equal(Object.hasOwn(tokens, 'cacheReadTokens'), Boolean(usage))
    assert.equal(Object.hasOwn(tokens, 'reasoningTokens'), Boolean(usage))
    if (usage) {
      assert.equal(tokens.cacheReadTokens, 0)
      assert.equal(tokens.reasoningTokens, 0)
    }
    assert.equal(chunks.at(-1).reason.kind, 'stop')
  }, OPEN_CODE_SNAPSHOTS.opencode)
})
const chatReply = () => sse([{ id: 'response', choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }])
async function environment(npm, fetcher, body, owned = snapshot('opencode', npm)) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-owned-')); const store = new CredentialFile(join(directory, 'keys.json'))
  await store.modify('opencode', async () => ({ type: 'api_key', key: 'fixture-key' }))
  const catalog = new OpenCodeCatalog('opencode', owned, { directory })
  const adapter = new OpenCodeAdapter({ catalogs: new Map([['opencode', catalog]]), store, fetcher })
  try { await body({ directory, store, catalog, adapter }) } finally { catalog.dispose(); await rm(directory, { recursive: true, force: true }) }
}
const history = (api, blocks, signatures) => ({ role: 'assistant', content: blocks, source: { provider: 'opencode', model: 'future-model', replayState: { response: { kind: 'pi-ai', version: 2, provider: 'opencode', model: 'future-model', api, responseId: 'reply_old', stopReason: 'toolUse' }, blocks: signatures } } })
for (const [npm, api, blocks, signatures, verify] of [
  ['@ai-sdk/anthropic', 'anthropic-messages', [{ type: 'reasoning', text: 'old thought' }, { type: 'tool-call', id: 'call_old', name: 'search', arguments: '{"q":"x"}' }], [{ type: 'reasoning', thinkingSignature: 'signed_old' }, { type: 'tool-call' }], body => { assert.equal(body.messages[0].content[0].signature, 'signed_old'); assert.equal(body.messages[0].content[1].id, 'call_old'); assert.equal(body.messages[1].content[0].tool_use_id, 'call_old') }],
  ['@ai-sdk/openai', 'openai-responses', [{ type: 'reasoning', text: 'old thought' }, { type: 'text', text: 'old answer' }, { type: 'tool-call', id: 'call_old|opaque_item_id', name: 'search', arguments: '{"q":"x"}' }], [{ type: 'reasoning', thinkingSignature: JSON.stringify({ type: 'reasoning', id: 'rs_old', encrypted_content: 'encrypted_old', summary: [{ type: 'summary_text', text: 'old thought' }] }) }, { type: 'text', textSignature: '{"v":1,"id":"msg_old","phase":"commentary"}' }, { type: 'tool-call' }], body => { assert.equal(body.store, false); assert.equal(body.reasoning.effort, 'high'); assert(body.include.includes('reasoning.encrypted_content')); assert.equal(body.input[0].encrypted_content, 'encrypted_old'); assert.equal(body.input[1].phase, 'commentary'); const call = body.input.find(item => item.type === 'function_call'); assert.equal(call.call_id, 'call_old'); assert.equal(call.id, 'opaque_item_id'); assert.equal(body.input.at(-1).call_id, 'call_old') }],
  ['@ai-sdk/google', 'google-generative-ai', [{ type: 'reasoning', text: 'old thought' }, { type: 'tool-call', id: 'call_old', name: 'search', arguments: '{"q":"x"}' }], [{ type: 'reasoning', thinkingSignature: 'signed_thought' }, { type: 'tool-call', thoughtSignature: 'signed_tool' }], body => { assert.equal(body.contents[0].parts[0].thoughtSignature, 'signed_thought'); assert.equal(body.contents[0].parts[1].thoughtSignature, 'signed_tool'); assert.equal(body.contents[1].parts[0].functionResponse.name, 'search') }],
  ['@ai-sdk/openai-compatible', 'openai-completions', [{ type: 'text', text: 'old answer' }, { type: 'tool-call', id: 'call_old', name: 'search', arguments: '{"q":"x"}' }], [{ type: 'text' }, { type: 'tool-call' }], body => { assert.equal(body.messages[0].tool_calls[0].id, 'call_old'); assert.equal(body.messages[1].tool_call_id, 'call_old') }],
]) test(`${api} pi v2 replay keeps signatures and matching tool results on the wire`, async () => {
  let request
  const fetcher = async (_url, init) => { request = JSON.parse(init.body); throw new Error('fixture stops after inspecting request') }
  await environment(npm, fetcher, async ({ adapter }) => {
    const callId = blocks.at(-1).id
    await assert.rejects(collect(adapter.stream({ provider: 'opencode', model: 'future-model', reasoningEffort: 'high', messages: [history(api, blocks, signatures), { role: 'tool', toolCallId: callId, content: [{ type: 'text', text: 'result' }] }] })))
    verify(request)
  })
})
test('invalid replay metadata warns and retains text/tool content; missing mandatory signature stops only that request', async () => {
  const messages = [history('openai-completions', [{ type: 'text', text: 'persisted' }, { type: 'tool-call', id: 'old', name: 'search', arguments: '{}' }], [])]; const warnings = []
  const prompt = await encodePrompt({ provider: 'opencode', model: 'future-model', messages }, snapshot().models[0], undefined, reason => warnings.push(reason))
  assert.equal(warnings.length, 1); assert.equal(prompt[0].content[0].text, 'persisted'); assert.equal(prompt[0].content[1].toolCallId, 'old')
  const source = history('anthropic-messages', [{ type: 'reasoning', text: 'old thought' }], [{ type: 'reasoning' }])
  await assert.rejects(encodePrompt({ provider: 'opencode', model: 'future-model', messages: [source] }, snapshot('opencode', '@ai-sdk/anthropic').models[0]), error => error.code === 'INVALID_REPLAY_STATE')
  await assert.rejects(encodePrompt({ provider: 'opencode', model: 'future-model', messages: [{ role: 'tool', toolCallId: 'orphan', content: [{ type: 'text', text: 'result' }] }] }, snapshot().models[0]), /matching call/)
})
test('prepared call retains descriptor generation; logout prevents its subsequent dispatch', async () => {
  let request
  await environment(undefined, async (_url, init) => { request = JSON.parse(init.body); return chatReply() }, async ({ catalog, adapter, store }) => {
    const prepared = await adapter.prepareCall('opencode', 'future-model')
    const directory = await mkdtemp(join(tmpdir(), 'new-generation-'))
    try {
      const refreshed = raw(); refreshed.models['future-model'].limit.output = 100
      const updated = new OpenCodeCatalog('opencode', normalizeCatalog('opencode', ['future-model'], refreshed, Date.now()), { directory })
      // Replace the mutable catalog owner, leaving the prepared closure intact.
      adapter.options.catalogs.set('opencode', updated)
      await collect(prepared.stream({ provider: 'opencode', model: 'future-model', messages: [] }))
      assert.equal(request.max_tokens, 4000); assert.equal((await adapter.resolveModel('opencode', 'future-model')).defaultMaxTokens, 100)
      await store.delete('opencode'); await assert.rejects(collect(prepared.stream({ provider: 'opencode', model: 'future-model', messages: [] })), /auth login/)
      updated.dispose()
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
for (const npm of ['@ai-sdk/anthropic', '@ai-sdk/openai', '@ai-sdk/openai-compatible', '@ai-sdk/google']) {
  test(`${npm} HTTP 429 preserves retry delay and request id, sends once, and hides echoed secrets`, async () => {
    let calls = 0
    await environment(npm, async () => { calls++; return Response.json({ error: { message: 'fixture-key', type: 'rate_limit_error' } }, { status: 429, headers: { 'retry-after': '3', 'x-request-id': 'req_fixture' } }) }, async ({ adapter }) => {
      await assert.rejects(collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [] })), error => { assert.equal(error.code, 'RATE_LIMIT'); assert.equal(error.failure.providerRetryAfterMs, 3000); assert.equal(error.failure.requestId, 'req_fixture'); assert(!String(error).includes('fixture-key')); assert.equal(error.cause, undefined); return true })
      assert.equal(calls, 1)
    })
  })
  test(`${npm} aborts while waiting for a non-cooperative fetch without retry`, async () => {
    const controller = new AbortController(); let started; const ready = new Promise(resolve => { started = resolve })
    await environment(npm, async (_url, init) => { started(); return new Promise(() => {}) }, async ({ adapter }) => {
      const operation = collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [], signal: controller.signal }))
      const checked = assert.rejects(operation, error => error === controller.signal.reason)
      await ready; controller.abort(new Error('user cancel')); await checked
    })
  })
}
test('five minute idle timeout ends a pending dispatch', async t => {
  let started; const ready = new Promise(resolve => { started = resolve })
  await environment(undefined, async () => { started(); return new Promise(() => {}) }, async ({ adapter }) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const operation = collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [] }))
    const checked = assert.rejects(operation, error => error.code === 'TIMEOUT')
    await ready; t.mock.timers.tick(300001); await checked; t.mock.timers.reset()
  })
})
test('truncated SSE never emits a successful terminal event', async () => {
  await environment(undefined, async () => sse([{ id: 'partial', choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] }]), async ({ adapter }) => {
    const chunks = []; await assert.rejects(async () => { for await (const chunk of adapter.stream({ provider: 'opencode', model: 'future-model', messages: [] })) chunks.push(chunk) })
    assert(!chunks.some(chunk => chunk.type === 'finish'))
  })
})
test('catalog completion after disposal cannot change models, save or notify', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'disposed-catalog-')); let complete; const pending = new Promise(resolve => { complete = resolve }); let changes = 0
  const catalog = new OpenCodeCatalog('opencode', snapshot(), { directory, fetcher: async url => { await pending; return Response.json(String(url).includes('models.dev') ? { opencode: raw() } : listing(['unknown'])) }, changed: () => changes++ })
  try { const operation = catalog.refresh(); catalog.dispose(); complete(); await operation; assert.equal(catalog.models().length, 1); assert.equal(changes, 0); await assert.rejects(readFile(join(directory, 'opencode.json')), { code: 'ENOENT' }) }
  finally { await rm(directory, { recursive: true, force: true }) }
})
test('explicit catalog commands share existing model-change notification and failure retains generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-api-')); let fail = false; let changes = 0
  const store = new CredentialFile(join(directory, 'keys.json')); let api
  const catalog = new OpenCodeCatalog('opencode', snapshot(), { directory, fetcher: async url => { if (fail) throw new Error('offline'); return Response.json(String(url).includes('models.dev') ? { opencode: raw() } : listing(['future-model', 'unknown'])) }, changed: () => api.notifyModelsChanged('opencode') })
  api = createDshAuthApi({ profiles: new Map([['opencode', { provider: 'opencode', displayName: 'Zen' }]]), catalogs: new Map([['opencode', catalog]]), store, resolveAsk: () => undefined, logger: { warn() {} } })
  const unsubscribe = api.onCredentialChange(() => changes++); const command = createAuthCommandHandler(api)
  try { const status = await command({ rawInput: 'models opencode' }); assert(status.text.includes('bundled')); const refreshed = await command({ rawInput: 'refresh opencode' }); assert.equal(refreshed.kind, 'success'); assert(refreshed.text.includes('unknown')); assert.equal(changes, 1); fail = true; assert.equal((await command({ rawInput: 'refresh opencode' })).kind, 'error'); assert.equal(changes, 1); assert.equal(catalog.models().length, 1) }
  finally { unsubscribe(); catalog.dispose(); await rm(directory, { recursive: true, force: true }) }
})
for (const npm of ['@ai-sdk/anthropic', '@ai-sdk/openai', '@ai-sdk/openai-compatible', '@ai-sdk/google']) {
  test(`${npm} user and tool-result images obey DSH resize/budget policy on the wire`, async () => {
    let request; const targets = []; const image = { attachmentId: 'img', width: 4096, height: 2048, mediaType: 'image/png' }
    await environment(npm, async (_url, init) => { request = JSON.parse(init.body); throw new Error('inspect image wire') }, async ({ adapter }) => {
      adapter.options.attachments = () => ({ readImageRequest: async (_ref, target) => { targets.push(target); return { bytes: 3, mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) } } })
      const protocol = snapshot('opencode', npm).models[0].protocol
      const metadata = protocol === 'google' ? { google: { thoughtSignature: 'signed_tool' } } : undefined
      const assistant = { role: 'assistant', content: [{ type: 'tool-call', id: 'call_image', name: 'search', arguments: '{}' }], source: { provider: 'opencode', model: 'future-model', replayState: { response: { kind: 'dsh-opencode', version: 1, provider: 'opencode', model: 'future-model', protocol }, blocks: [{ type: 'tool-call', providerOptions: metadata }] } } }
      await assert.rejects(collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [assistant, { role: 'tool', toolCallId: 'call_image', content: [{ type: 'image', attachment: image }] }, { role: 'user', content: [{ type: 'image', attachment: image }] }] })))
      assert.equal(targets.length, 2); assert(targets.every(target => target.width * target.height <= 4194304 && target.maxBytes === 1048576))
      assert(JSON.stringify(request).includes('AQID'))
    })
  })
  test(`${npm} premature end cannot finish successfully`, async () => {
    await environment(npm, async () => new Response('', { headers: { 'content-type': 'text/event-stream' } }), async ({ adapter }) => {
      const chunks = []; await assert.rejects(async () => { for await (const chunk of adapter.stream({ provider: 'opencode', model: 'future-model', messages: [] })) chunks.push(chunk) }); assert(!chunks.some(chunk => chunk.type === 'finish'))
    })
  })
}
test('image budget requests offload, text-only/offloaded images do not load bytes', async () => {
  const model = snapshot().models[0]; const ref = { attachmentId: 'img', width: 1, height: 1, mediaType: 'image/png' }; let reads = 0
  const attachments = () => ({ readImageRequest: async () => { reads++; return { bytes: 1048576, mediaType: 'image/png', data: new Uint8Array([1]) } } })
  const messages = [{ role: 'user', content: Array.from({ length: 16 }, () => ({ type: 'image', attachment: ref })) }]
  await assert.rejects(encodePrompt({ provider: 'opencode', model: 'future-model', messages }, model, attachments), error => error.failure.offloadImages === 1)
  reads = 0; await encodePrompt({ provider: 'opencode', model: 'future-model', messages }, { ...model, inputModalities: ['text'] }, attachments); assert.equal(reads, 0)
  await encodePrompt({ provider: 'opencode', model: 'future-model', messages: [{ role: 'user', content: [{ type: 'image', attachment: ref, offloaded: true }] }] }, model, attachments); assert.equal(reads, 0)
})
test('catalog network body limits, cancellation and strict snapshot cost validation', async () => {
  await assert.rejects(fetchCatalogJson('https://models.dev/api.json', async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1)); controller.close() } }))), /32 MiB/)
  const controller = new AbortController(); let started; const ready = new Promise(resolve => { started = resolve })
  const operation = fetchCatalogJson('https://models.dev/api.json', async () => { started(); return new Promise(() => {}) }, controller.signal)
  const checked = assert.rejects(operation, error => error === controller.signal.reason); await ready; controller.abort(new Error('stop')); await checked
  const cached = snapshot(); cached.models[0].cost = { input: -1 }; assert.throws(() => parseSnapshot(cached, 'opencode'))
  assert.throws(() => parseSnapshot({ ...snapshot(), roster: ['future-model', 'future-model'] }, 'opencode'))
})
test('older cross-process catalog cannot overwrite a newer persisted generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-generation-')); let slowReady; const slow = new Promise(resolve => { slowReady = resolve })
  const newer = new OpenCodeCatalog('opencode', snapshot(), { directory, now: () => Date.now() + 20, fetcher: async url => Response.json(String(url).includes('models.dev') ? { opencode: raw() } : listing(['future-model', 'new'])) })
  const older = new OpenCodeCatalog('opencode', snapshot(), { directory, now: () => Date.now() - 20, fetcher: async url => { await slow; return Response.json(String(url).includes('models.dev') ? { opencode: raw() } : listing(['future-model', 'old'])) } })
  try { const pending = older.refresh(); await newer.refresh(); slowReady(); await pending; const saved = JSON.parse(await readFile(join(directory, 'opencode.json'))); assert(saved.roster.includes('new')); assert(!saved.roster.includes('old')) }
  finally { newer.dispose(); older.dispose(); await rm(directory, { recursive: true, force: true }) }
})
test('successful roster still removes retired ids when model details fail; new ids are excluded individually', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-partial-'))
  const previous = normalizeCatalog('opencode', ['future-model', 'retired'], { ...raw(), models: { ...raw().models, retired: raw().models['future-model'] } }, 1)
  const catalog = new OpenCodeCatalog('opencode', previous, { directory, fetcher: async url => { if (String(url).includes('models.dev')) throw new Error('offline metadata'); return Response.json(listing(['future-model', 'new'])) } })
  try { await catalog.refresh(); assert.deepEqual(catalog.models().map(model => model.id), ['future-model']); assert.equal(catalog.status().excluded[0].id, 'new'); assert(catalog.status().warning.includes('exact-route')) } finally { catalog.dispose(); await rm(directory, { recursive: true, force: true }) }
})

// Receive actual protocol streams, persist their owned envelope, and resend it.
// This exercises metadata emitted by the SDK, not hand-built replay options.
for (const [npm, events, verify] of [
  ['@ai-sdk/anthropic', [
    { type: 'message_start', message: { id: 'msg_new', type: 'message', role: 'assistant', model: 'future-model', content: [], usage: { input_tokens: 6, output_tokens: 0, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'thinking' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig_new' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call_new', name: 'search', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"q":"x"}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ], (body, usage) => { assert.equal(body.messages[0].content[0].signature, 'sig_new'); assert.equal(body.messages[1].content[0].tool_use_id, 'call_new'); assert.equal(usage.cacheWriteTokens, 2); assert.equal(usage.cacheReadTokens, 4); assert.equal(usage.inputTokens, 6) }],
  ['@ai-sdk/openai', [
    { type: 'response.created', response: { id: 'resp_new', model: 'future-model', created_at: 1 } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_new', encrypted_content: null, summary: [] } },
    { type: 'response.reasoning_summary_text.delta', item_id: 'rs_new', output_index: 0, summary_index: 0, delta: 'thinking' },
    { type: 'response.reasoning_summary_part.done', item_id: 'rs_new', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: 'thinking' } },
    { type: 'response.reasoning_summary_part.added', item_id: 'rs_new', output_index: 0, summary_index: 1, part: { type: 'summary_text', text: '' } },
    { type: 'response.reasoning_summary_text.delta', item_id: 'rs_new', output_index: 0, summary_index: 1, delta: 'more thinking' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', id: 'rs_new', encrypted_content: 'encrypted_new', summary: [{ type: 'summary_text', text: 'thinking' }] } },
    { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', id: 'fc_new', call_id: 'call_new', name: 'search', arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_new', output_index: 1, delta: '{"q":"x"}' },
    { type: 'response.output_item.done', output_index: 1, item: { type: 'function_call', id: 'fc_new', call_id: 'call_new', name: 'search', arguments: '{"q":"x"}', status: 'completed' } },
    { type: 'response.completed', response: { id: 'resp_new', model: 'future-model', status: 'completed', usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 2 } } } },
  ], body => { assert.equal(body.input[0].encrypted_content, 'encrypted_new'); assert.equal(body.input[0].id, 'rs_new'); assert.equal(body.input[1].id, 'fc_new'); assert.equal(body.input.at(-1).call_id, 'call_new') }],
  ['@ai-sdk/google', [
    { candidates: [{ content: { role: 'model', parts: [{ thought: true, text: 'thinking', thoughtSignature: 'thought_new' }] }, index: 0 }] },
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'call_new', name: 'search', args: { q: 'x' } }, thoughtSignature: 'tool_new' }] }, index: 0 }] },
    { candidates: [{ content: { role: 'model', parts: [] }, index: 0, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 13, cachedContentTokenCount: 4, thoughtsTokenCount: 2 } },
  ], body => { assert.equal(body.contents[0].parts[0].thoughtSignature, 'thought_new'); assert.equal(body.contents[0].parts[1].thoughtSignature, 'tool_new'); assert.equal(body.contents[1].parts[0].functionResponse.name, 'search') }],
]) test(`${npm} newly streamed reasoning/tool signatures survive owned history replay`, async () => {
  let calls = 0; let replayRequest
  await environment(npm, async (_url, init) => {
    if (calls++) { replayRequest = JSON.parse(init.body); throw new Error('stop fixture after inspecting replay') }
    return new Response(events.map(event => `${npm === '@ai-sdk/anthropic' ? `event: ${event.type}\n` : ''}data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }, async ({ adapter }) => {
    const chunks = await collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [], tools: [{ name: 'search', parameters: { type: 'object' } }] }))
    const finish = chunks.at(-1); const blocks = chunks.filter(chunk => chunk.type === 'block-end').sort((a, b) => a.index - b.index).map(chunk => chunk.block)
    assert.equal(finish.reason.kind, 'tool-calls'); assert(blocks.some(block => block.type === 'reasoning' && block.text === 'thinking'))
    const tool = blocks.find(block => block.type === 'tool-call'); assert.deepEqual(JSON.parse(tool.arguments), { q: 'x' })
    const assistant = { role: 'assistant', content: blocks, source: { provider: 'opencode', model: 'future-model', replayState: finish.replayState } }
    await assert.rejects(collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [assistant, { role: 'tool', toolCallId: tool.id, content: [{ type: 'text', text: 'result' }] }] })))
    verify(replayRequest, chunks.at(-2).usage)
  })
})

test('owned Anthropic metadata overrides the SDK limits and sampling table for a known id', async () => {
  let request
  await environment('@ai-sdk/anthropic', async (_url, init) => { request = JSON.parse(init.body); throw new Error('inspect owned settings') }, async ({ adapter, catalog }) => {
    const saved = snapshot('opencode', '@ai-sdk/anthropic')
    saved.roster = ['claude-sonnet-5-5']; saved.models[0].id = saved.roster[0]; saved.models[0].maxTokens = 200000
    adapter.options.catalogs.set('opencode', new OpenCodeCatalog('opencode', saved))
    await assert.rejects(collect(adapter.stream({ provider: 'opencode', model: saved.roster[0], temperature: 0.4, messages: [] })))
    assert.equal(request.max_tokens, 200000); assert.equal(request.temperature, 0.4)
  })
})

test('public protocol names cannot select inherited object properties', () => {
  for (const protocol of ['toString', 'constructor', '__proto__']) {
    const result = normalizeCatalog('opencode', ['future-model'], raw(protocol), 1)
    assert.equal(result.models.length, 0); assert.match(result.excluded[0].reason, /unsupported/)
  }
})

test('Responses final-only tool arguments are complete before the DSH block-end event', async () => {
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_final', call_id: 'call_final', name: 'search', arguments: '' } },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', id: 'fc_final', call_id: 'call_final', name: 'search', arguments: '{"q":"final"}', status: 'completed' } },
    { type: 'response.completed', response: { id: 'resp_final', model: 'future-model', status: 'completed', usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
  ]
  await environment('@ai-sdk/openai', async () => sse(events), async ({ adapter }) => {
    const chunks = await collect(adapter.stream({ provider: 'opencode', model: 'future-model', messages: [], tools: [{ name: 'search', parameters: { type: 'object' } }] }))
    const ends = chunks.filter(chunk => chunk.type === 'block-end')
    assert.equal(ends.length, 1); assert.equal(ends[0].block.arguments, '{"q":"final"}')
    assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
  })
})

test('stream abort completes even when the underlying response cancellation never settles', { timeout: 1000 }, async () => {
  const controller = new AbortController()
  const body = new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('data: '+JSON.stringify({ id: 'partial', choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] })+'\n\n')) },
    cancel() { return new Promise(() => {}) },
  })
  await environment(undefined, async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }), async ({ adapter }) => {
    await assert.rejects(async () => {
      for await (const chunk of adapter.stream({ provider: 'opencode', model: 'future-model', messages: [], signal: controller.signal })) {
        if (chunk.type === 'text-delta') controller.abort(new Error('cancel active stream'))
      }
    }, error => error === controller.signal.reason)
  })
})

for (const [npm, assertSettings] of [
  ['@ai-sdk/anthropic', body => { assert.equal(body.output_config.effort, 'future-effort'); assert.equal(body.thinking, undefined) }],
  ['@ai-sdk/openai', body => assert.equal(body.reasoning.effort, 'future-effort')],
  ['@ai-sdk/openai-compatible', body => assert.equal(body.reasoning_effort, 'future-effort')],
  ['@ai-sdk/google', body => { assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'future-effort'); assert.equal(body.generationConfig.thinkingConfig.includeThoughts, true) }],
]) test(`${npm} owned effort passes through even when absent from SDK enums`, async () => {
  let request
  await environment(npm, async (_url, init) => { request = JSON.parse(init.body); throw new Error('inspect public effort') }, async ({ adapter }) => {
    const publicData = raw(npm); publicData.models['future-model'].reasoning_options[0].values = ['future-effort']
    adapter.options.catalogs.set('opencode', new OpenCodeCatalog('opencode', normalizeCatalog('opencode', ['future-model'], publicData, 1)))
    await assert.rejects(collect(adapter.stream({ provider: 'opencode', model: 'future-model', reasoningEffort: 'future-effort', messages: [] })))
    assertSettings(request)
  })
})

test('Responses encrypted reasoning is never borrowed from a different response item', async () => {
  const content = [{ type: 'reasoning', text: 'first' }, { type: 'reasoning', text: 'second' }]
  const source = { provider: 'opencode', model: 'future-model', replayState: { response: { kind: 'dsh-opencode', version: 1, provider: 'opencode', model: 'future-model', protocol: 'responses' }, blocks: [
    { type: 'reasoning', providerOptions: { openai: { itemId: 'rs_first' } } },
    { type: 'reasoning', providerOptions: { openai: { itemId: 'rs_second', reasoningEncryptedContent: 'second_encrypted' } } },
  ] } }
  await assert.rejects(encodePrompt({ provider: 'opencode', model: 'future-model', messages: [{ role: 'assistant', source, content }] }, snapshot('opencode', '@ai-sdk/openai').models[0]), error => error.code === 'INVALID_REPLAY_STATE')
})
