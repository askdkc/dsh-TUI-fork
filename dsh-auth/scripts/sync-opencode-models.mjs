/**
 * Refresh the OpenCode model snapshot from live sources.
 *
 * Roster (which models exist) follows the Zen gateway itself — the source of
 * truth per deepseek-harness discussion #5654:
 *   https://opencode.ai/zen/v1/models
 *   https://opencode.ai/zen/go/v1/models
 * (Probe lesson from that thread: derive the /models URL from the
 * `api === "openai-completions"` entry's baseUrl — the first catalog entry
 * may speak the Anthropic protocol whose base lacks `/v1` and would 404.)
 *
 * Metadata (context windows, costs, modalities) comes from
 * https://models.dev/api.json, which tracks models faster than pi-ai
 * releases; anything the gateway serves but neither source describes is
 * recorded as a sibling-fallback marker and cloned from the nearest catalog
 * sibling at runtime (see ../src/fresh-models.ts).
 *
 * On any fetch/validation failure the existing generated file is left
 * untouched and the script exits non-zero — a stale snapshot with a loud
 * error beats a silently emptied one. Runtime always unions with the
 * installed pi-ai catalog, so a failed refresh can only delay additions,
 * never remove working models.
 *
 * Run: `pnpm --dir dsh-auth sync:models`
 * Output: `../src/opencode-snapshot.generated.ts` (checked in).
 */
import { createRequire } from 'node:module'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src', 'opencode-snapshot.generated.ts')

const MODELS_DEV_URL = 'https://models.dev/api.json'
const LIVE = {
  opencode: 'https://opencode.ai/zen/v1/models',
  'opencode-go': 'https://opencode.ai/zen/go/v1/models',
}
const FETCH_TIMEOUT_MS = 30_000
const MAX_BODY_BYTES = 32 * 1024 * 1024

function fail(message) {
  console.error(`sync-opencode-models: ${message}`)
  process.exit(1)
}

async function fetchJson(url, label) {
  let response
  try {
    response = await fetch(url, {
      headers: { 'user-agent': 'dsh-auth sync-opencode-models', accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    fail(`${label} unreachable (${url}): ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) fail(`${label} rejected (${url}): HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? '0')
  if (length > MAX_BODY_BYTES) fail(`${label} too large (${length} bytes)`)
  try {
    return await response.json()
  } catch {
    fail(`${label} returned invalid JSON`)
  }
}

function record(value, what) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${what} is not an object`)
  return value
}

function idList(payload, url) {
  const data = record(payload, `${url} payload`).data
  if (!Array.isArray(data)) fail(`${url} payload has no data array`)
  const ids = []
  for (const row of data) {
    const id = record(row, `${url} row`).id
    if (typeof id !== 'string' || id.length === 0) fail(`${url} row has no id`)
    ids.push(id)
  }
  return [...new Set(ids)].sort()
}

/** The installed pi-ai catalog, resolved exactly like src/pi-ai.ts does. */
async function installedCatalog() {
  const adapterManifest = import.meta.resolve('@deepseek-ai/dsh-llm-pi-ai/package.json')
  const require = createRequire(adapterManifest)
  // File URLs bypass the package export map (whose provider entries are
  // `import`-conditioned and invisible to require.resolve); the existsSync
  // walk is the same one src/pi-ai.ts uses to find the adapter's catalog.
  const { existsSync } = await import('node:fs')
  const roots = require.resolve.paths('@earendil-works/pi-ai') ?? fail('dsh-llm-pi-ai has no resolvable pi-ai')
  const at = root => join(root, '@earendil-works', 'pi-ai')
  const root = roots.map(at).find(dir => existsSync(join(dir, 'dist', 'providers', 'opencode.models.js')))
  if (root === undefined) fail('installed pi-ai has no opencode catalog')
  const zen = await import(pathToFileURL(join(root, 'dist', 'providers', 'opencode.models.js')).href)
  const go = await import(pathToFileURL(join(root, 'dist', 'providers', 'opencode-go.models.js')).href)
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  if (typeof version !== 'string') fail('installed pi-ai has no version')
  const chatIds = module => Object.keys(module.OPENCODE_MODELS ?? module.OPENCODE_GO_MODELS ?? {})
  return {
    version,
    zen: new Set(chatIds(zen)),
    go: new Set(chatIds(go)),
    classifiers: new Set([
      ...Object.keys(zen.OPENCODE_CLASSIFIER_MODELS ?? {}),
      ...Object.keys(go.OPENCODE_GO_CLASSIFIER_MODELS ?? {}),
    ]),
  }
}

/** Allowlisted models.dev entry fields — the only ones fresh-models.ts reads. */
function allowlistEntry(provider, id, models) {
  const raw = record(models[id], `models.dev ${provider}/${id}`)
  const entry = { id }
  if (typeof raw.name === 'string' && raw.name.length > 0) entry.name = raw.name
  else fail(`models.dev ${provider}/${id} has no name`)
  if (typeof raw.reasoning === 'boolean') entry.reasoning = raw.reasoning
  if (typeof raw.attachment === 'boolean') entry.attachment = raw.attachment
  const modalities = record(raw.modalities ?? {}, `models.dev ${provider}/${id} modalities`).input
  if (!Array.isArray(modalities) || modalities.length === 0 || !modalities.every(m => typeof m === 'string')) {
    fail(`models.dev ${provider}/${id} has no input modalities`)
  }
  entry.modalities = { input: modalities }
  const limit = record(raw.limit ?? {}, `models.dev ${provider}/${id} limit`)
  if (typeof limit.context !== 'number' || !(limit.context > 0)) fail(`models.dev ${provider}/${id} has no context limit`)
  entry.limit = { context: limit.context }
  if (typeof limit.output === 'number' && limit.output > 0) entry.limit.output = limit.output
  const cost = record(raw.cost ?? {}, `models.dev ${provider}/${id} cost`)
  for (const key of ['input', 'output']) {
    if (typeof cost[key] !== 'number' || cost[key] < 0) fail(`models.dev ${provider}/${id} has no ${key} cost`)
  }
  entry.cost = { input: cost.input, output: cost.output }
  if (typeof cost.cache_read === 'number' && cost.cache_read >= 0) entry.cost.cache_read = cost.cache_read
  if (typeof raw.temperature === 'boolean') entry.temperature = raw.temperature
  const options = Array.isArray(raw.reasoning_options) ? raw.reasoning_options : []
  const effort = options.find(option => record(option, `models.dev ${provider}/${id} reasoning option`).type === 'effort')
  if (effort !== undefined) {
    const values = record(effort, `models.dev ${provider}/${id} effort option`).values
    if (!Array.isArray(values) || !values.every(v => typeof v === 'string')) {
      fail(`models.dev ${provider}/${id} has malformed effort values`)
    }
    entry.reasoning_options = { effort: values }
  }
  return entry
}

const modelsDev = await fetchJson(MODELS_DEV_URL, 'models.dev')
const zenSection = record(record(modelsDev, 'models.dev').opencode ?? fail('models.dev has no opencode section'), 'models.dev opencode')
const goSection = record(record(modelsDev, 'models.dev')['opencode-go'] ?? fail('models.dev has no opencode-go section'), 'models.dev opencode-go')
const zenMdModels = record(zenSection.models ?? fail('models.dev opencode has no models'), 'models.dev opencode models')
const goMdModels = record(goSection.models ?? fail('models.dev opencode-go has no models'), 'models.dev opencode-go models')

const liveZen = idList(await fetchJson(LIVE.opencode, 'zen gateway'), LIVE.opencode)
const liveGo = idList(await fetchJson(LIVE['opencode-go'], 'go gateway'), LIVE['opencode-go'])
const installed = await installedCatalog()

function buildRoute(route, live, mdModels, mdFallbackModels) {
  const builtIn = route === 'opencode' ? installed.zen : installed.go
  const roster = live.filter(id => !installed.classifiers.has(id))
  const entries = {}
  const fallback = []
  for (const id of roster) {
    if (builtIn.has(id)) continue
    const source = Object.hasOwn(mdModels, id) ? mdModels
      : Object.hasOwn(mdFallbackModels, id) ? mdFallbackModels : undefined
    if (source === undefined) fallback.push(id)
    else entries[id] = allowlistEntry(route, id, source)
  }
  return { roster, entries, fallback }
}

const generatedAt = new Date().toISOString()
const snapshot = {
  version: 1,
  generatedAt,
  piAiVersion: installed.version,
  sources: { modelsDev: MODELS_DEV_URL, zen: LIVE.opencode, go: LIVE['opencode-go'] },
  classifiers: [...installed.classifiers].sort(),
  opencode: buildRoute('opencode', liveZen, zenMdModels, goMdModels),
  'opencode-go': buildRoute('opencode-go', liveGo, goMdModels, zenMdModels),
}

const zenExtra = Object.keys(snapshot.opencode.entries).length + snapshot.opencode.fallback.length
const goExtra = Object.keys(snapshot['opencode-go'].entries).length + snapshot['opencode-go'].fallback.length
console.log(`sync-opencode-models: pi-ai ${installed.version}; live roster zen=${snapshot.opencode.roster.length} go=${snapshot['opencode-go'].roster.length}; beyond catalog zen=+${zenExtra} go=+${goExtra}`)
for (const id of snapshot['opencode-go'].fallback) console.log(`  go sibling-fallback (no models.dev entry): ${id}`)
for (const id of snapshot.opencode.fallback) console.log(`  zen sibling-fallback (no models.dev entry): ${id}`)

const body = `/**
 * Generated by scripts/sync-opencode-models.mjs — do not edit by hand.
 * Refresh: \`pnpm --dir dsh-auth sync:models\`.
 *
 * generatedAt: ${generatedAt}
 * pi-ai: ${installed.version}
 * live roster: zen=${snapshot.opencode.roster.length} go=${snapshot['opencode-go'].roster.length}
 * beyond installed catalog: zen=+${zenExtra} go=+${goExtra}
 *
 * Shape contract (see src/fresh-models.ts parseSnapshotData):
 * version=1, per route { roster (live chat ids, sorted), entries
 * (allowlisted models.dev metadata for roster ids the installed catalog
 * lacks), fallback (roster ids neither source describes — runtime clones
 * the nearest catalog sibling and flags nothing on the model object;
 * provenance lives here) }, classifiers (live ids pi-ai serves on its
 * classifier path, excluded from the chat merge).
 */
export const OPENCODE_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const;
`
writeFileSync(`${OUT}.tmp`, body)
renameSync(`${OUT}.tmp`, OUT)
console.log(`sync-opencode-models: wrote src/opencode-snapshot.generated.ts`)
