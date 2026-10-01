import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { registerTuiSessionEventTypes } from './sessionLog.js'

interface StoredSession {
  readonly meta: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly inheritedEventCount?: number
}

/** Read stored events through a read handle and always release ownership. */
export interface SessionReader {
  open(id: SessionId, access: 'read'): Promise<{
    readonly header: SessionHeader
    readonly inheritedEventCount?: number
    read(): Promise<{ readonly events: readonly SessionEvent[] }>
    close(): Promise<void>
  }>
}

export async function readPersistedSession(source: SessionReader, id: SessionId): Promise<StoredSession> {
  registerTuiSessionEventTypes()
  const handle = await source.open(id, 'read')
  try {
    const { events } = await handle.read()
    return { meta: handle.header, events, inheritedEventCount: handle.inheritedEventCount }
  } finally {
    await handle.close()
  }
}
