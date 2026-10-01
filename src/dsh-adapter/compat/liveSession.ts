/**
 * Live Session snapshots and exact inherited-prefix boundaries.
 * Source slices never infer their cut from a child-owned end-seed marker.
 * Physical JSONL seedLength belongs to the storage reader, not the live API.
 */
import { SessionSeq, SessionLogOffset, interruptedTurnClosers } from '@deepseek-ai/dsh-session'
import type { CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'

interface LiveSessionShape {
  readonly seq?: unknown
  readonly inheritedEventCount?: unknown
  readonly header?: Record<string, unknown>
  snapshotEvents?: (fromSeq?: unknown, toSeqExclusive?: unknown) => unknown
}

function liveOf(session: unknown): LiveSessionShape {
  if (session === null || typeof session !== 'object') {
    throw new Error('live Session contract violation: session is not an object')
  }
  return session as LiveSessionShape
}

function asNonNegativeInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
    ? value
    : undefined
}

/**
 * Snapshot of a live Session log, including any fork-inherited prefix.
 * Reuses upstream's frozen cache when the log has not appended.
 * A missing or non-array snapshot is a live Session contract violation.
 */
export function snapshotLiveSessionEvents(session: unknown): readonly SessionEvent[] {
  const live = liveOf(session)
  if (typeof live.snapshotEvents === 'function') {
    const snap = live.snapshotEvents()
    if (!Array.isArray(snap)) {
      throw new Error('live Session contract violation: snapshotEvents() did not return an array')
    }
    return snap as readonly SessionEvent[]
  }
  throw new Error('live Session contract violation: snapshotEvents() is unavailable')
}

/**
 * Exclusive log offset (`seq = log.length`). Empty log is 0, not -1, and this
 * is not the last event's seq.
 */
export function liveSessionOffset(session: unknown): number {
  const seq = asNonNegativeInt(liveOf(session).seq)
  if (seq !== undefined) return seq
  throw new Error('live Session contract violation: seq is not a non-negative safe integer')
}

/**
 * Physical/wire `seedLength` for a live Session: present whenever an exact
 * copied/inherited prefix is marked as seeded, independently of whether the
 * header records `parentSession`. Fresh unseeded sessions omit it.
 * `isSeeded: true` without `inheritedEventCount` is an unknown cut — never
 * coerced to 0.
 */
export function liveSessionPhysicalSeedLength(session: unknown): number | undefined {
  const live = liveOf(session)
  const header = live.header
  if (header !== undefined && typeof header['isSeeded'] === 'boolean') {
    if (header['isSeeded'] !== true) return undefined
    return asNonNegativeInt(live.inheritedEventCount)
  }
  return undefined
}

/** Listing-shaped fields for overlaying a live Session onto the session tree. */
export function liveSessionListingFields(session: unknown): {
  readonly id: string | undefined
  readonly cwd: string | undefined
  readonly createdAt: number | undefined
  readonly parentSession: string | undefined
  readonly origin: string | undefined
  readonly delegationDepth: number | undefined
  readonly agentPreset: string | undefined
  readonly seedLength: number | undefined
} {
  const header = liveOf(session).header ?? {}
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined
  return {
    id: text(header['id']),
    cwd: text(header['cwd']),
    createdAt: asNonNegativeInt(header['createdAt']),
    parentSession: text(header['parentSession']),
    origin: text(header['origin']),
    delegationDepth: asNonNegativeInt(header['delegationDepth']),
    agentPreset: text(header['agentPreset']),
    seedLength: liveSessionPhysicalSeedLength(session),
  }
}

function assertTurnClosed(sliced: readonly SessionEvent[], boundaryLabel: string): void {
  const lastTurn = sliced.findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
  if (lastTurn?.type === 'turn/start') {
    throw new Error(`fork boundary ${boundaryLabel} ends inside open turn ${String(lastTurn.data.turn)}`)
  }
}

/**
 * Copy of the source log through an inclusive event seq. Omitted boundary
 * means the whole log and still rejects an open turn. Never calls
 * `sessions.fork()`.
 */
export function sliceLiveSessionSeed(session: unknown, boundary?: number): SessionEvent[] {
  const events = snapshotLiveSessionEvents(session)
  const offset = liveSessionOffset(session)
  if (events.length !== offset) {
    throw new Error(
      `live Session contract violation: snapshot length ${events.length} does not match exclusive seq ${offset}`,
    )
  }
  if (boundary === undefined) {
    const sliced = [...events]
    if (sliced.length === 0) return sliced
    assertTurnClosed(sliced, String(offset - 1))
    return sliced
  }
  if (!Number.isSafeInteger(boundary) || boundary < 0 || Object.is(boundary, -0)) {
    throw new Error(`fork boundary must be a non-negative safe integer, got ${String(boundary)}`)
  }
  if (boundary >= offset) {
    const lastSeq = offset === 0 ? 'none' : String(offset - 1)
    throw new Error(`fork boundary ${boundary} does not exist (last seq: ${lastSeq})`)
  }
  const boundaryEvent = events[boundary]
  if (boundaryEvent === undefined || boundaryEvent.seq !== boundary) {
    throw new Error(`fork boundary ${boundary} does not match a contiguous event seq`)
  }
  const sliced = events.slice(0, boundary + 1)
  assertTurnClosed(sliced, String(boundary))
  return sliced
}

/** Seed ownership is independent of whether the child is shown as a root. */
export function liveSessionSeedMetadata(inheritedCount: number): {
  readonly meta: { readonly isSeeded: true }
  readonly inheritedEventCount: ReturnType<typeof SessionLogOffset>
} {
  return { meta: { isSeeded: true }, inheritedEventCount: SessionLogOffset(inheritedCount) }
}

/** Close an open turn with the `turn/end` shape a real user cancellation writes. */
export function appendInterruptedTurnEnd(seed: SessionEvent[], turn: number): void {
  const last = seed[seed.length - 1]
  if (last === undefined) return
  seed.push({
    type: 'turn/end',
    seq: SessionSeq(Number(last.seq) + 1),
    time: last.time + 1,
    data: { turn, reason: { kind: 'aborted', reason: { kind: 'user' } } },
  } as SessionEvent)
}

/** Close a V3 fork's open inherited turn as child-owned events, after its marker. */
export function closeLiveForkTurn(session: Session, turn: number): void {
  for (const event of interruptedTurnClosers(snapshotLiveSessionEvents(session))) {
    switch (event.type) {
      case 'tool/result':
        session.append('tool/result', event.data, {
          surfaceOp: event.surfaceOp,
          ...(event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs }),
        })
        break
      case 'step/end':
        session.append('step/end', event.data)
        break
      case 'turn/end':
        if (event.data.turn !== turn) throw new Error('fork turn closure does not match its selected turn')
        session.append('turn/end', { turn, reason: { kind: 'aborted', reason: { kind: 'user' } } })
        break
      default:
        throw new Error(`unsupported fork closure event: ${event.type}`)
    }
  }
}

export interface LiveSessionCreateRequest {
  readonly sessionId: SessionId
  readonly seed: readonly SessionEvent[]
  readonly inheritedCount: number
  readonly cwd: string
  readonly parentSession?: SessionId
  readonly agentPreset?: string
  readonly agentOptions: CreateAgentOptions['agentOptions']
  readonly setup?: CreateAgentOptions['setup']
}

/** Create a seeded agent using the current host contract. */
export function liveSessionCreateOptions(request: LiveSessionCreateRequest): CreateAgentOptions {
  const seedMetadata = liveSessionSeedMetadata(request.inheritedCount)
  return {
    sessionId: request.sessionId,
    seed: request.seed,
    meta: {
      cwd: request.cwd,
      ...(request.parentSession === undefined ? {} : { parentSession: request.parentSession }),
      ...seedMetadata.meta,
      ...(request.agentPreset === undefined ? {} : { agentPreset: request.agentPreset }),
    },
    inheritedEventCount: seedMetadata.inheritedEventCount,
    agentOptions: request.agentOptions,
    ...(request.setup === undefined ? {} : { setup: request.setup }),
  }
}
