import type { Context } from '@deepseek-ai/cordis'
import type Schema from '@deepseek-ai/schemastery'

/** Volatile Config fields are refs; ordinary fields retain plain values. */
export type RuntimeConfig<T> = { [K in keyof T]: T[K] | { get(): T[K] } }

/** Declare only UI preferences as live fields, never the agent/session route. */
export function editableConfig<T>(schema: Schema<T>, keys: readonly (keyof T)[]): Schema<T, RuntimeConfig<T>> {
  for (const key of keys) {
    const field = schema.dict?.[String(key)]
    if (field !== undefined) schema.dict![String(key)] = field.volatile()
  }
  return schema as Schema<T, RuntimeConfig<T>>
}

/** Settings forms use the Config owner's Loader ID, not the plugin name. */
export function resolveSettingsNamespace(ctx: Context, schema: Pick<Schema, 'dict'>): string {
  if (!Object.values(schema.dict ?? {}).some(field => field.meta.volatile === true)) {
    throw new Error('dsh-tui: profile-backed settings require @deepseek-ai/schemastery >= 3.18.3 with volatile Config support. Update DSH and reinstall the current profile dependencies before starting the TUI.')
  }
  const owner = ctx.fiber as typeof ctx.fiber & { entry?: { options: { id?: string } } }
  const ns = owner.entry?.options.id
  if (!ns) throw new Error('dsh-tui: profile-backed settings require a Loader entry for the Config owner.')
  return ns
}

/** Snapshot at an operation boundary; retain the host refs for later updates. */
export function configValues<T extends object>(config: RuntimeConfig<T>): T {
  return Object.fromEntries(Object.entries(config).map(([key, value]: [string, unknown]) => [
    key,
    value !== null && typeof value === 'object' && 'get' in value && typeof value.get === 'function'
      ? value.get()
      : value,
  ])) as T
}

interface SettingsScope<T> {
  get(): T
  watch(callback: (next: T) => void): () => void
}

/** Watch committed Config values on the owning Loader fiber. */
export function createSettingsScope<T>(ctx: Context, current: () => T): SettingsScope<T> {
  return {
    get: current,
    watch: callback => ctx.on('loader/volatile-update', () => callback(current())),
  }
}

/** Read the current settings form descriptor. */
export function settingsValue(settings: {
  describe(): readonly { ns: string; value?: unknown }[]
}, ns: string): unknown {
  return settings.describe().find(row => row.ns === ns)?.value
}
