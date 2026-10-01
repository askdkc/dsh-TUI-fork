/**
 * Building the session list.
 *
 * One resolution path produces one usable, honestly-classified record per
 * stored session — every kind, empties included — and callers decide what to
 * show. That split is deliberate: the old picker filtered while it resolved,
 * so "hide sub-agent runs" and "resolve a title" were the same pass and
 * neither could change without disturbing the other. Here the browser can
 * toggle sub-agent runs into view, or offer to clean up boot artifacts,
 * without re-deriving anything.
 *
 * Cost: backend enumeration plus a revision comparison per session. Only a
 * changed revision needs artifact I/O, and append-only changes read the new
 * suffix. Incomplete titles are recovered after the list is returned. The path
 * this replaces decompressed every frame of the twenty most recent logs on
 * every open — 3.9 s over a 31 MB history.
 *
 * @module dsh-cli/sessions/list
 */
import { basename } from 'node:path'
import {
  digestAppendedSuffix,
  digestSession,
  sessionTitleAnchor,
} from './digest.js'
import { fileFacts } from './frames.js'
import { scheduleTitleRecovery, titleRecoveryNeedsWork } from './recovery.js'
import { classify, readHeader, type RawSessionHeader } from './header.js'
import { findSessionLogFile, resolveLocatedPath } from '../compat/sessionLog.js'
import { indexFileStamp, readIndex, writeIndex, type DerivedEntry, type SessionIndex } from './store.js'
import type { SessionSummary } from './types.js'
import { readLastUsed } from '../../sessionHistory.js'

/** A late overlapping listing must not write an older index over a newer one. */
const listingVersions = new WeakMap<SessionSource, number>()
/** Large append batches use bounded windows, then background title recovery. */
const FOREGROUND_SUFFIX_BYTES = 2 * 1024 * 1024

/** Current persistence snapshots and optional artifact location for JSONL backends. */
export interface SessionSource {
  list(options?: { signal?: AbortSignal }): Promise<readonly unknown[]>
  locate?: (meta: unknown) => unknown
}

/** A header paired with the backend's authoritative change token. */
interface Listed {
  readonly header: RawSessionHeader
  readonly raw: unknown
  readonly revision: string
}

/** Pull `{ header, revision }` out of one `list()` element. */
function readSnapshot(value: unknown): Listed | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const raw = record['header']
  const header = readHeader(raw)
  if (header === undefined) return undefined
  const revision = record['revision']
  return typeof revision === 'string' ? { header, raw, revision } : undefined
}

/** Enumerate current snapshots with the backend's authoritative revision. */
export async function enumerateSessions(source: SessionSource, signal?: AbortSignal): Promise<Listed[]> {
  const snapshots = await source.list({ signal })
  return snapshots.map(readSnapshot).filter((entry): entry is Listed => entry !== undefined)
}

/** Backend artifact location; file discovery also supports optional current embedders. */
function locate(source: SessionSource, raw: unknown, sessionId: string): string | undefined {
  if (typeof source.locate === 'function') {
    let location: unknown
    try {
      location = source.locate(raw)
    } catch {
      location = undefined
    }
    if (location !== null && typeof location === 'object') {
      const path = (location as Record<string, unknown>)['path']
      if (typeof path === 'string' && path.length > 0) return resolveLocatedPath(path)?.path
    }
  }
  return findSessionLogFile(sessionId)
}

/**
 * Read every stored session into a complete summary.
 *
 * @param source - The persistence service.
 * @param signal - Optional cancellation for the backend's own listing work.
 * @returns One summary per stored session, most recently active first. No
 *   filtering of any kind is applied — sub-agent runs and sessions with no
 *   conversation are present and labelled as such.
 */
export async function listSummaries(
  source: SessionSource,
  signal?: AbortSignal,
  onEnriched?: (summary: SessionSummary) => void,
): Promise<readonly SessionSummary[]> {
  const version = (listingVersions.get(source) ?? 0) + 1
  listingVersions.set(source, version)
  let listed: Listed[]
  try {
    listed = await enumerateSessions(source, signal)
  } catch {
    return []
  }

  // Children are counted from the same listing rather than by walking logs:
  // lineage lives in the header, so a parent's sub-agent count is free.
  const children = new Map<string, number>()
  for (const entry of listed) {
    if (entry.header.origin !== 'subagent') continue
    const parent = entry.header.parentSession
    if (parent === undefined) continue
    children.set(parent, (children.get(parent) ?? 0) + 1)
  }

  const indexStamp = indexFileStamp()
  const index = readIndex()
  const next: SessionIndex = new Map()
  const lastUsed = readLastUsed()
  let changed = false
  const records: Array<{
    header: RawSessionHeader
    facts: ReturnType<typeof fileFacts>
    cached: ReturnType<typeof index.get>
    derived: DerivedEntry | undefined
  }> = []
  const recordsById = new Map<string, typeof records[number]>()
  const earlyEnrichments = new Map<string, DerivedEntry>()
  let summariesReady = false
  const notifyEnriched = (id: string, enriched: DerivedEntry): void => {
    if (!summariesReady) {
      earlyEnrichments.set(id, enriched)
      return
    }
    const record = recordsById.get(id)
    if (record === undefined || record.derived?.revision !== enriched.revision) return
    record.derived = enriched
    onEnriched?.(summaryOf(record))
  }
  const scanWork: Array<{
    id: string
    revision: string
    path: string
    bytes: number
    modifiedAt: number
    identity: string
    priority: number
  }> = []

  for (const { header, raw, revision } of listed) {
    const cached = index.get(header.id)
    let facts: ReturnType<typeof fileFacts>
    let derived = cached?.derived
    let path: string | undefined
    // The backend's opaque revision is authoritative. A hit does not even
    // resolve a path; incomplete titles are handled by the recovery queue.
    if (derived === undefined || derived.revision !== revision) {
      path = locate(source, raw, header.id)
      facts = path === undefined ? undefined : fileFacts(path)
      derived = undefined
      if (cached?.derived !== undefined) changed = true
      if (path !== undefined) {
        const previous = cached?.derived
        const appendGrowth = (
          facts !== undefined && previous?.identity !== undefined &&
          previous.identity === facts.identity && previous.anchor !== undefined &&
          facts.bytes > previous.bytes &&
          await sessionTitleAnchor(path, previous.bytes, signal) === previous.anchor
        )
        if (appendGrowth && facts !== undefined && previous !== undefined && facts.bytes - previous.bytes <= FOREGROUND_SUFFIX_BYTES) {
          const suffix = await digestAppendedSuffix(path, previous.bytes, facts.bytes, signal)
          if (suffix.complete) {
            derived = {
              revision,
              bytes: facts.bytes,
              modifiedAt: facts.modifiedAt,
              identity: facts.identity,
              anchor: await sessionTitleAnchor(path, facts.bytes, signal),
              title: suffix.title?.text ?? previous.title,
              titleSource: suffix.title?.source ?? previous.titleSource,
              titleComplete: suffix.title !== undefined || previous.titleComplete,
              hasPrompt: previous.hasPrompt || suffix.hasHumanPrompt,
              model: suffix.model ?? previous.model,
              label: suffix.label ?? previous.label,
            }
          }
        }
        if (derived === undefined) {
          const digest = digestSession(path, header.cwd ?? '')
          const carried = appendGrowth && digest.titleComplete !== true ? previous : undefined
          derived = {
            revision,
            bytes: facts?.bytes ?? 0,
            modifiedAt: facts?.modifiedAt,
            identity: facts?.identity,
            anchor: facts === undefined ? undefined : await sessionTitleAnchor(path, facts.bytes, signal),
            title: carried?.title ?? digest.title?.text ?? '',
            titleSource: carried?.titleSource ?? digest.title?.source ?? 'fallback',
            titleComplete: digest.titleComplete === true,
            hasPrompt: digest.hasPrompt,
            model: digest.model ?? carried?.model,
            label: digest.label ?? carried?.label,
          }
        }
        changed = true
      }
    }
    if (
      derived !== undefined && !derived.titleComplete && signal?.aborted !== true &&
      titleRecoveryNeedsWork(header.id, derived.revision, enriched => notifyEnriched(header.id, enriched))
    ) {
      // A revision hit still may need enrichment, but locating that rare log
      // stays off the ordinary warm path once recovery has been scheduled.
      if (path === undefined) path = locate(source, raw, header.id)
      if (facts === undefined && path !== undefined) facts = fileFacts(path)
      if (path !== undefined && facts !== undefined && derived.bytes === facts.bytes) {
        scanWork.push({
          id: header.id,
          revision: derived.revision,
          path,
          bytes: facts.bytes,
          modifiedAt: facts.modifiedAt,
          identity: facts.identity,
          priority: Math.max(facts.modifiedAt, lastUsed[header.id] ?? 0, header.createdAt ?? 0),
        })
      }
    }
    // Carry every entry that holds anything worth keeping — including a pure
    // cache hit, which must survive into the next index or the following
    // listing would re-derive everything it just reused.
    if (derived !== undefined || cached?.branch !== undefined) {
      next.set(header.id, { derived, branch: cached?.branch })
    }
    const record = { header, facts, cached, derived }
    records.push(record)
    recordsById.set(header.id, record)
  }
  // Entries for sessions the backend no longer lists are dropped here; that is
  // the whole of the cache's garbage collection, and it runs on every listing.
  const newest = listingVersions.get(source) === version
  if (newest && (changed || next.size !== index.size) && indexFileStamp() === indexStamp) writeIndex(next)

  const summaryOf = ({ header, facts, cached, derived }: typeof records[number]): SessionSummary => ({
    id: header.id,
    kind: classify(header),
    title: {
      text:
        derived?.title !== undefined && derived.title.length > 0
          ? derived.title
          : basename(header.cwd ?? '') || header.id.slice(0, 8),
      source: derived?.titleSource ?? 'fallback',
    },
    cwd: header.cwd ?? '',
    createdAt: header.createdAt ?? derived?.modifiedAt ?? facts?.modifiedAt ?? 0,
    updatedAt: Math.max(derived?.modifiedAt ?? facts?.modifiedAt ?? 0, lastUsed[header.id] ?? 0, header.createdAt ?? 0),
    bytes: derived?.bytes ?? facts?.bytes,
    // Without a readable artifact nothing can be proven empty, and hiding a
    // real session is the worse error — so an unreadable log is listed.
    hasPrompt: derived?.hasPrompt ?? true,
    agentPreset: header.agentPreset,
    model: derived?.model,
    label: derived?.label,
    branch: cached?.branch,
    childCount: children.get(header.id) ?? 0,
  })
  for (const [id, enriched] of earlyEnrichments) {
    const record = recordsById.get(id)
    if (record?.derived?.revision === enriched.revision) record.derived = enriched
  }
  const summaries: SessionSummary[] = records.map(summaryOf)
  summariesReady = true

  if (newest) {
    for (const work of scanWork) {
      scheduleTitleRecovery(work, derived => notifyEnriched(work.id, derived))
    }
  }

  // A total order, not just a sort key. `updatedAt` is dominated by the log's
  // mtime, and sessions written inside the same millisecond tie on it — which
  // would leave their relative order down to whatever the backend happened to
  // enumerate first, so the same history could list differently twice in a
  // row. Creation time breaks the tie, and the id breaks that.
  return summaries.sort(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      right.createdAt - left.createdAt ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )
}

/**
 * Resolve one session's artifact path.
 *
 * Listing headers is a first-line-only read per log — about 2 ms across a
 * fifty-session history — so the preview pane resolves its target this way
 * rather than making every summary carry a filesystem path it has no business
 * knowing about.
 *
 * @param source - The persistence service.
 * @param sessionId - Session to locate.
 * @returns The absolute artifact path, or undefined when the backend owns no
 *   per-session file or the session is gone.
 */
export async function locateSession(
  source: SessionSource,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  let listed: Listed[]
  try {
    listed = await enumerateSessions(source, signal)
  } catch {
    return undefined
  }
  const match = listed.find(entry => entry.header.id === sessionId)
  return match === undefined ? undefined : locate(source, match.raw, sessionId)
}
