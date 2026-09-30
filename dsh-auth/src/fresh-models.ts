/**
 * Fresh OpenCode rosters on top of the installed pi-ai catalog.
 *
 * The installed catalog is the wire authority (per-model `api` protocol,
 * base URLs, compat): overlapping ids are served untouched. The checked-in
 * snapshot (`opencode-snapshot.generated.ts`, refreshed from models.dev plus
 * the live Zen `/v1/models` rosters) contributes only roster ids the
 * installed catalog lacks — each synthesized with per-model protocol
 * resolution, never a route-level default:
 *
 * - models.dev metadata (name, reasoning, modalities, limits, cost) plus the
 *   wire envelope (`api`, `baseUrl`, `compat`, thinking levels, image
 *   budgets) inherited from the nearest same-route catalog sibling;
 * - ids neither source describes are cloned wholesale from that sibling and
 *   keep working wherever the sibling does (provenance lives in the
 *   snapshot, not on the model object).
 *
 * The merge only ever adds: the result always covers the installed catalog,
 * so a stale snapshot delays additions but can never remove working models.
 *
 * @module dsh-auth/fresh-models
 */
import type { PiAiProvider } from './pi-ai.js'
import { OPENCODE_SNAPSHOT } from './opencode-snapshot.generated.js'

type PiModel = ReturnType<PiAiProvider['getModels']>[number]

/** One allowlisted models.dev entry (see scripts/sync-opencode-models.mjs). */
export interface FreshModelEntry {
  readonly id: string
  readonly name: string
  readonly reasoning?: boolean
  readonly attachment?: boolean
  readonly modalities: { readonly input: readonly string[] }
  readonly limit: { readonly context: number; readonly output?: number }
  readonly cost: { readonly input: number; readonly output: number; readonly cache_read?: number }
  readonly temperature?: boolean
  readonly reasoning_options?: { readonly effort: readonly string[] }
}

interface SnapshotRoute {
  readonly roster: readonly string[]
  readonly entries: Readonly<Record<string, FreshModelEntry>>
  readonly fallback: readonly string[]
}

interface SnapshotData {
  readonly version: 1
  readonly generatedAt: string
  readonly piAiVersion: string
  readonly classifiers: readonly string[]
  readonly opencode: SnapshotRoute
  readonly 'opencode-go': SnapshotRoute
}

export type FreshRouteId = 'opencode' | 'opencode-go'

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`dsh-auth: snapshot ${what} is not an object`)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function boundedStringList(value: unknown, what: string, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length > max || !value.every(item => typeof item === 'string')) {
    throw new Error(`dsh-auth: snapshot ${what} is not a string list`)
  }
  const list = value as string[]
  if (new Set(list).size !== list.length) throw new Error(`dsh-auth: snapshot ${what} has duplicates`)
  return list
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function parseEntry(route: string, key: string, value: unknown): FreshModelEntry {
  const row = record(value, `${route}/${key}`)
  if (row.id !== key) throw new Error(`dsh-auth: snapshot ${route}/${key} names "${String(row.id)}"`)
  const name = nonEmptyString(row.name)
  if (name === undefined) throw new Error(`dsh-auth: snapshot ${route}/${key} has no name`)
  const modalities = record(row.modalities ?? fail(route, key, 'modalities'), `${route}/${key} modalities`).input
  if (!Array.isArray(modalities) || modalities.length === 0 || !modalities.every(m => typeof m === 'string')) {
    throw new Error(`dsh-auth: snapshot ${route}/${key} has no input modalities`)
  }
  const limit = record(row.limit ?? fail(route, key, 'limit'), `${route}/${key} limit`)
  const context = positiveInt(limit.context)
  if (context === undefined) throw new Error(`dsh-auth: snapshot ${route}/${key} has no context limit`)
  const output = limit.output === undefined ? undefined : positiveInt(limit.output)
  if (limit.output !== undefined && output === undefined) {
    throw new Error(`dsh-auth: snapshot ${route}/${key} has a malformed output limit`)
  }
  const cost = record(row.cost ?? fail(route, key, 'cost'), `${route}/${key} cost`)
  const input = nonnegativeNumber(cost.input)
  const outputCost = nonnegativeNumber(cost.output)
  if (input === undefined || outputCost === undefined) {
    throw new Error(`dsh-auth: snapshot ${route}/${key} has no pricing`)
  }
  const cacheRead = cost.cache_read === undefined ? undefined : nonnegativeNumber(cost.cache_read)
  if (cost.cache_read !== undefined && cacheRead === undefined) {
    throw new Error(`dsh-auth: snapshot ${route}/${key} has malformed cache pricing`)
  }
  const entry: FreshModelEntry = {
    id: key,
    name,
    reasoning: typeof row.reasoning === 'boolean' ? row.reasoning : undefined,
    attachment: typeof row.attachment === 'boolean' ? row.attachment : undefined,
    temperature: typeof row.temperature === 'boolean' ? row.temperature : undefined,
    reasoning_options: parseEffort(route, key, row.reasoning_options),
    modalities: { input: (modalities as string[]).slice() },
    limit: output === undefined ? { context } : { context, output },
    cost: cacheRead === undefined ? { input, output: outputCost } : { input, output: outputCost, cache_read: cacheRead },
  }
  return entry
}

function parseEffort(route: string, key: string, value: unknown): FreshModelEntry['reasoning_options'] {
  if (value === undefined) return undefined
  const options = record(value, `${route}/${key} reasoning options`).effort
  if (options === undefined) return undefined
  if (!Array.isArray(options) || !options.every(v => typeof v === 'string')) {
    throw new Error(`dsh-auth: snapshot ${route}/${key} has malformed effort values`)
  }
  return { effort: (options as string[]).slice() }
}

function fail(route: string, key: string, what: string): never {
  throw new Error(`dsh-auth: snapshot ${route}/${key} has no ${what}`)
}

function parseRoute(route: string, value: unknown): SnapshotRoute {
  const row = record(value, route)
  const roster = boundedStringList(row.roster, `${route} roster`, 500)
  if (roster.some(id => id.length === 0)) throw new Error(`dsh-auth: snapshot ${route} roster has an empty id`)
  const entriesRaw = record(row.entries ?? {}, `${route} entries`)
  const entries: Record<string, FreshModelEntry> = {}
  for (const key of Object.keys(entriesRaw)) entries[key] = parseEntry(route, key, entriesRaw[key])
  const fallback = boundedStringList(row.fallback ?? [], `${route} fallback`, 500)
  return { roster, entries, fallback }
}

/** Validate the checked-in snapshot once; a malformed file is a boot error. */
function parseSnapshotData(input: unknown): SnapshotData {
  const root = record(input, 'root')
  if (root.version !== 1) throw new Error('dsh-auth: snapshot has an unsupported version')
  if (nonEmptyString(root.generatedAt) === undefined) throw new Error('dsh-auth: snapshot has no timestamp')
  return {
    version: 1,
    generatedAt: root.generatedAt as string,
    piAiVersion: nonEmptyString(root.piAiVersion) ?? 'unknown',
    classifiers: boundedStringList(root.classifiers ?? [], 'classifiers', 500),
    opencode: parseRoute('opencode', root.opencode),
    'opencode-go': parseRoute('opencode-go', root['opencode-go']),
  }
}

const SNAPSHOT = parseSnapshotData(OPENCODE_SNAPSHOT as unknown)

/** Length of the id prefix two models share (`a-b` vs `a-c` share 2). */
function sharedPrefixLength(a: string, b: string): number {
  const end = Math.min(a.length, b.length)
  let length = 0
  while (length < end && a[length] === b[length]) length += 1
  return length
}

/** Wire protocols, most universal first, for deterministic sibling choice. */
function apiRank(api: string): number {
  if (api === 'openai-completions') return 0
  if (api === 'openai-responses') return 1
  if (api === 'anthropic-messages') return 2
  if (api === 'google-generative-ai') return 3
  return 4
}

/**
 * Nearest same-route catalog sibling: longest shared id prefix wins, then
 * the most universal wire protocol, then alphabetical order. Documented
 * approximation, fully deterministic — the same snapshot and catalog always
 * resolve the same wire envelope.
 */
function nearestSibling(catalog: readonly PiModel[], id: string): PiModel {
  let best = catalog[0]
  if (best === undefined) throw new Error('dsh-auth: installed catalog is empty')
  for (const candidate of catalog) {
    const prefix = sharedPrefixLength(candidate.id, id)
    const bestPrefix = sharedPrefixLength(best.id, id)
    if (
      prefix > bestPrefix
      || (prefix === bestPrefix && apiRank(candidate.api) < apiRank(best.api))
      || (prefix === bestPrefix && apiRank(candidate.api) === apiRank(best.api) && candidate.id < best.id)
    ) {
      best = candidate
    }
  }
  return best
}

/** pi-ai thinking levels; `off` is always unsupported, the rest map to themselves. */
const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

function thinkingLevels(effort: readonly string[], sibling: PiModel): PiModel['thinkingLevelMap'] {
  const siblingMap = (sibling.thinkingLevelMap ?? {}) as Record<string, string | null>
  const levels = new Set(effort)
  // Only narrow the sibling envelope when every effort value it names fits
  // inside it; otherwise the sibling map stands (documented approximation).
  if (![...levels].every(level => Object.hasOwn(siblingMap, level))) return sibling.thinkingLevelMap
  const map: Record<string, string | null> = { off: null }
  for (const level of THINKING_LEVELS) {
    if (!Object.hasOwn(siblingMap, level)) continue
    map[level] = levels.has(level) ? level : null
  }
  return map as PiModel['thinkingLevelMap']
}

/**
 * Resolve one snapshot roster id to a pi-shaped model: wire envelope from
 * the sibling, display metadata and capacity from models.dev. pi-ai drops
 * video/pdf/audio modalities (text/image only) and never discloses
 * cache-write pricing, so both are inherited or omitted — see field notes.
 */
function synthesize(catalog: readonly PiModel[], route: FreshRouteId, id: string, entry: FreshModelEntry | undefined): PiModel {
  const sibling = nearestSibling(catalog, id)
  // Same-route sibling, so its provider id is already the route's own.
  if (entry === undefined) return { ...sibling, id, name: id }
  const modalities = new Set(entry.modalities.input)
  if (!modalities.has('text')) {
    throw new Error(`dsh-auth: snapshot ${route}/${id} has no text modality`)
  }
  const compat = entry.temperature === false
    ? { ...sibling.compat, supportsTemperature: false } as typeof sibling.compat
    : sibling.compat
  const input = modalities.has('image') ? ['text', 'image'] as const : ['text'] as const
  return {
    ...sibling,
    id,
    name: entry.name,
    reasoning: entry.reasoning ?? sibling.reasoning,
    input: [...input],
    cost: {
      input: entry.cost.input,
      output: entry.cost.output,
      cacheRead: entry.cost.cache_read ?? sibling.cost.cacheRead ?? 0,
      cacheWrite: sibling.cost.cacheWrite ?? 0,
    },
    contextWindow: entry.limit.context,
    maxTokens: entry.limit.output ?? sibling.maxTokens,
    compat,
    thinkingLevelMap: entry.reasoning === false
      ? undefined
      : entry.reasoning_options === undefined
        ? sibling.thinkingLevelMap
        : thinkingLevels(entry.reasoning_options.effort, sibling),
    type: 'chat',
  } as PiModel
}

/**
 * Union the snapshot roster onto one catalog provider. Installed models win
 * on conflict and classifier-roster ids stay on pi-ai's classifier path, so
 * the merged list always covers the installed catalog — a stale snapshot
 * delays additions but never removes a working model.
 * @param catalog - the installed pi-ai catalog provider for one route.
 * @param route - the route the snapshot section is keyed under.
 * @returns the catalog provider, or a shallow clone serving the union.
 */
export function withFreshModels(catalog: PiAiProvider, route: FreshRouteId): PiAiProvider {
  const section = SNAPSHOT[route]
  const installed = new Map(catalog.getModels().map(model => [model.id, model] as const))
  const classifiers = new Set(SNAPSHOT.classifiers)
  const catalogModels = catalog.getModels()
  const extras: PiModel[] = []
  for (const id of section.roster) {
    if (installed.has(id) || classifiers.has(id)) continue
    const marker = section.fallback.includes(id)
    const key = marker ? undefined : section.entries[id]
    if (!marker && key === undefined) {
      throw new Error(
        `dsh-auth: snapshot ${route}/${id} is on the roster but has neither metadata nor a fallback marker`,
      )
    }
    extras.push(synthesize(catalogModels, route, id, key))
  }
  if (extras.length === 0) return catalog
  return {
    ...catalog,
    getModels: () => [...catalog.getModels(), ...extras],
  }
}

/** Snapshot roster ids for one route, for smoke coverage. */
export function freshRosterIds(route: FreshRouteId): readonly string[] {
  return SNAPSHOT[route].roster.slice()
}
