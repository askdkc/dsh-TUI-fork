/**
 * Headless regression for /login credential status. The fake channel exposes
 * metadata only: no credential value enters the UI or this test.
 */
process.env.FORCE_COLOR = '0'
delete process.env.DEEPSEEK_API_KEY

const [
  { strict: assert },
  { PassThrough, Writable },
  React,
  { render },
  { Chat },
  { QuestionStore },
  { LOCAL_COMMANDS },
  { setLang },
  { settled, sleep },
] = await Promise.all([
  import('node:assert'),
  import('node:stream'),
  import('react'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('../src/commands.js'),
  import('../src/i18n.js'),
  import('./lib/term-test.mjs'),
])

class FakeStdout extends Writable {
  constructor(private readonly writeFrame?: (chunk: string, callback: () => void) => void) { super() }
  columns = 100
  rows = 28
  isTTY = true
  _write(_chunk: unknown, _encoding: BufferEncoding, callback: () => void) {
    if (this.writeFrame) this.writeFrame(String(_chunk), callback)
    else callback()
  }
}

class FakeStderr extends Writable {
  isTTY = true
  _write(_chunk: unknown, _encoding: BufferEncoding, callback: () => void) {
    callback()
  }
}

class FakeStdin extends PassThrough {
  isTTY = true
  setRawMode() { return this }
  ref() { return this }
  unref() { return this }
}

const SECRET_SENTINEL = 'test-secret-must-not-appear'

function makeChannel(status: unknown, authStatuses?: readonly unknown[]) {
  return {
    version: 0,
    whaleIdle: false, // 探针确定性：鲸鱼闲置动画不进测量窗口
    rows: [],
    status: 'idle' as const,
    sessionTitle: 'login-probe',
    agentId: 'login-probe',
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
    tokens: { input: 0, output: 0 },
    cwd: 'C:/code/demo-project',
    displayCwd: 'C:/code/demo-project',
    gitBranch: 'main',
    working: false,
    spinnerMode: 'requesting' as const,
    responseChars: 0,
    activeToolCount: 0,
    turnStart: 0,
    lastUserText: '',
    pending: [],
    commandList: LOCAL_COMMANDS,
    notifications: [],
    contextWindow: undefined,
    reasoningEffort: 'high',
    lastUsage: undefined,
    tps: undefined,
    tpsSamples: [],
    activityFrames: 'moon8',
    activityEnabled: false,
    contextBarEnabled: true,
    agentPreset: 'standard',
    goal: undefined,
    todos: [],
    loadedContext: undefined,
    contextSegments: { system: 0, prompt: 0, assistant: 0, thinking: 0, tools: 0 },
    mode: { id: 'default', plan: false, sandbox: 'workspace-write', approval: 'ask' },
    modeIndex: 0,
    subscribe: () => () => {},
    localCalls: [] as { command: string; lines: readonly string[] }[],
    credentialRefs: [] as string[],
    submit() {},
    steer() {},
    removePending: () => true,
    cancel() {},
    interruptAndDeliver: () => 0,
    clear() {},
    notify() {},
    pushLocal(command: string, lines: readonly string[]) {
      this.localCalls.push({ command, lines })
    },
    async describeCredential(ref: string) {
      this.credentialRefs.push(ref)
      if (status instanceof Error) throw status
      return status
    },
    listModels: () => Promise.resolve([]),
    // No dsh-auth-style plugin in this harness: /login renders exactly its
    // pre-plugin lines (the OAuth account section stays absent).
    oauthProviderStatuses: async () => authStatuses,
    commandCompletions(input: string) {
      const prefix = input.replace(/^\//u, '').trim().toLowerCase()
      return this.commandList
        .filter(command => command.name.startsWith(prefix))
        .map(command => ({ ...command, commandLine: `/${command.name}`, replacement: `/${command.name} ` }))
    },
    runExternalCommand: async () => '',
    loadOlder: () => 0,
    listFiles: async () => [],
    listSessions: () => [],
    previewSession: async () => [],
    setResumeTarget: () => {},
    setActivityFrames: () => true,
    listPresets: async () => [],
    switchPreset: async () => false,
    switchModel: async () => false,
    rewindTo: async () => null,
    resumeTo: async () => ({ ok: false, reason: 'unavailable' }),
    newSession: async () => false,
    mcpStatus: () => [],
    exportSession: () => null,
    initWorkspace: () => null,
    doctorInfo: () => [],
    listSubagents: async () => [],
    compact() {},
  }
}

async function runLogin(status: unknown, authStatuses?: readonly unknown[]) {
  const channel = makeChannel(status, authStatuses)
  const stdin = new FakeStdin()
  const instance = await render(
    <Chat channel={channel as never} questionStore={new QuestionStore()} />,
    {
      stdout: new FakeStdout(),
      stdin,
      stderr: new FakeStderr(),
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )
  // 固定窗:pacing 等启动首帧——假 stdout 丢弃全部帧，没有可轮询的观察点
  await sleep(500)
  stdin.write('/login\r')
  const reported = await settled(() => channel.localCalls.length === 1)
  await instance.unmount()
  assert.ok(reported, '/login must produce one local report')
  // 卸载后再精确计数：迟到的第二条 report 只有在这里才会被发现。
  assert.equal(channel.localCalls.length, 1, '/login must produce exactly one local report (post-unmount)')
  assert.deepEqual(channel.credentialRefs, ['DEEPSEEK_API_KEY'], '/login must query the credentials service')
  return channel.localCalls[0].lines
}

setLang('en')

const configured = await runLogin({
  configured: true,
  source: 'file',
  writable: true,
  value: SECRET_SENTINEL,
})
assert.ok(configured.some(line => line.includes('configured')), 'managed credential must be shown as configured')
assert.ok(configured.some(line => line.includes('file')), 'credential source must be shown')
assert.ok(configured.some(line => line.includes('writable')), 'credential writability must be shown')
assert.ok(configured.every(line => !line.includes('not configured')), 'managed credential must not be reported missing')

const missing = await runLogin({ configured: false, writable: true })
assert.ok(missing.some(line => line.includes('not configured')), 'missing credential must be reported')
assert.ok(missing.some(line => line.includes('none')), 'missing credential must have no source')

const unavailable = await runLogin(undefined)
assert.ok(unavailable.some(line => line.includes('service unavailable')), 'missing service must degrade clearly')

const rejected = await runLogin(new Error('credential backend unavailable'))
assert.ok(rejected.some(line => line.includes('service unavailable')), 'describe failure must degrade safely')

const apiKey = await runLogin(undefined, [{ provider: 'opencode', signedIn: true, expiresAt: undefined, expired: false }])
assert.ok(apiKey.some(line => line.includes('opencode') && line.includes('signed in')), 'API-key status must appear in /login')
assert.ok(apiKey.every(line => !line.includes('1970')), 'permanent API key must not show epoch-zero expiry')

const eventChannel = makeChannel(undefined)
let changed: ((provider: string) => void) | undefined
let unsubscribed = false
let invalidations = 0
let modelReads = 0
Object.assign(eventChannel, {
  providerSetup: () => ({ oauth: { onCredentialChange: (listener: (provider: string) => void) => {
    changed = listener
    return () => { unsubscribed = true }
  } } }),
  invalidateModelCompletion: () => { invalidations += 1 },
  listModels: async () => { modelReads += 1; return [] },
  listProviders: async () => [],
})
const eventInstance = await render(
  <Chat channel={eventChannel as never} questionStore={new QuestionStore()} />,
  { stdout: new FakeStdout(), stdin: new FakeStdin(), stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)
assert.ok(await settled(() => changed !== undefined), 'Chat must subscribe to credential changes')
const initialReads = modelReads
changed!('opencode')
assert.ok(await settled(() => invalidations === 1 && modelReads > initialReads),
  'auth change must invalidate /model completion and refetch models without a restart')
await eventInstance.unmount()
assert.ok(unsubscribed, 'Chat must release the auth subscription on unmount')

// Catalog notifications reach the real Chat and terminal renderer while a
// search is open. They never select a replacement model behind the user.
const { Terminal } = await import('@xterm/headless')
const { viewportLines } = await import('./lib/term-test.mjs')
const term = new Terminal({ cols: 100, rows: 28, allowProposedApi: true })
const modelStdin = new FakeStdin()
const modelChannel = makeChannel(undefined)
let catalogChanged: ((provider: string) => void) | undefined
let modelsFail = false
let reads = 0
let switches = 0
let catalog = [
  { provider: 'opencode', id: 'future-keep', name: 'Future Keep' },
  { provider: 'opencode', id: 'future-other', name: 'Future Other' },
]
Object.assign(modelChannel, {
  provider: 'opencode', model: 'future-keep',
  providerSetup: () => ({ oauth: { onCredentialChange: (listener: (provider: string) => void) => {
    catalogChanged = listener; return () => { catalogChanged = undefined }
  } } }),
  invalidateModelCompletion() {},
  listModels: async () => { reads++; if (modelsFail) throw new Error('offline'); return catalog },
  listProviders: async () => [{ id: 'opencode', name: 'OpenCode Zen' }],
  switchModel: async () => { switches++; return true },
})
const screen = () => viewportLines(term).join('\n')
const modelInstance = await render(
  <Chat channel={modelChannel as never} questionStore={new QuestionStore()} />,
  { stdout: new FakeStdout((chunk, done) => term.write(chunk, done)), stdin: modelStdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)
try {
  assert.ok(await settled(() => catalogChanged !== undefined))
  modelStdin.write('/model future\r')
  assert.ok(await settled(() => screen().includes('Future Keep') && screen().includes('opencode/future-keep')), 'model search opens at the current route')
  catalog = [{ provider: 'opencode', id: 'future-added', name: 'Future Added' }, ...catalog]
  catalogChanged!('opencode')
  assert.ok(await settled(() => screen().includes('Future Added') && screen().includes('opencode/future-keep')), 'catalog addition preserves search and focused route')
  assert.ok(screen().includes('future'), 'search input survives the update')
  modelsFail = true; const beforeFailure = reads; catalogChanged!('opencode')
  assert.ok(await settled(() => reads > beforeFailure))
  assert.ok(screen().includes('Future Keep') && screen().includes('opencode/future-keep'), 'failed update retains the visible catalog and focus')
  modelsFail = false; catalog = [...catalog, { provider: 'opencode', id: 'future-retry', name: 'Future Retry' }]
  modelStdin.write('\x12')
  assert.ok(await settled(() => screen().includes('Future Retry')), 'Ctrl+R retries without closing the search')
  catalog = catalog.filter(model => model.id !== 'future-keep'); catalogChanged!('opencode')
  assert.ok(await settled(() => !screen().includes('Future Keep') && screen().includes('Future Retry')), 'successful roster removes the retired row')
  assert.equal(modelChannel.model, 'future-keep'); assert.equal(switches, 0, 'retirement must not select another model')
} finally { await modelInstance.unmount(); term.dispose() }
assert.equal(catalogChanged, undefined)

for (const lines of [configured, missing, unavailable, rejected]) {
  assert.ok(
    lines.every(line => !line.includes(SECRET_SENTINEL)),
    'credential values must never enter /login output',
  )
}

console.log('/login credential status verified (configured, missing, unavailable, rejected)')
