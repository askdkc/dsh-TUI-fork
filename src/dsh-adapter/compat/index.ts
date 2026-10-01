/**
 * Current DSH boundary helpers: strict live snapshots, Config-backed settings,
 * foreground shell execution, persistence handles and bounded session logs.
 * No older host API dispatch is retained. Current TUI event registration and
 * read limits remain here so consumers share one storage contract.
 */
export {
  appendInterruptedTurnEnd,
  liveSessionCreateOptions,
  liveSessionListingFields,
  liveSessionOffset,
  sliceLiveSessionSeed,
  snapshotLiveSessionEvents,
} from './liveSession.js'
export {
  appendSessionTitle,
  defaultMaxScanned,
  deleteSessionLog,
  registerTuiSessionEventTypes,
  findSessionLogFile,
  TUI_SESSION_EVENT_TYPES,
  readPhysicalHeaderSeedLength,
  readPhysicalHeaderSeedLengthForSession,
  readSessionEventsFromFile,
  readSessionEventsFromLog,
  readSessionTitleFromLog,
  type SessionLogRead,
  sessionsRoots,
  userTitleData,
} from './sessionLog.js'
