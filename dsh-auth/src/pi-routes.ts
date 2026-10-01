import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PiAiAdapter, type PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import type { PiAiAuthContext } from './pi-ai.js'
export { buildOAuthProfile } from './profiles.js'
export { createCustomProfile, CUSTOM_PROVIDER_IDS, type CustomProviderId } from './custom-profiles.js'
/**
 * The ambient auth context providers may consult while resolving their own
 * auth. `env()` answers from the process environment; `fileExists()` answers
 * about the host process's filesystem (the paths a provider asks about —
 * `~/.aws/credentials` and friends — are facts about where this process
 * runs, not about the project under edit).
 */
export function hostAuthContext(): PiAiAuthContext {
  return {
    env: async name => process.env[name],
    fileExists: path => Promise.resolve(
      path.startsWith('~/') ? existsSync(join(homedir(), path.slice(2))) : existsSync(path),
    ),
  }
}

/**
 * The adapter the plugin registers: a {@link PiAiAdapter} whose *advisory
 * catalog* is credential-gated. A provider with no stored credential
 * lists no models — its rows never reach any model picker, which is the
 * whole point: picking a model that would only fail with "not signed in"
 * is noise. The gate only shapes `listModels`; `resolveModel` and requests
 * are untouched, so a model id already saved in a session (or named
 * explicitly) keeps resolving exactly as the registry contract promises
 * ("advisory and never changes routing").
 *
 * An expired-but-stored credential still lists: token refresh runs on the
 * next request, and a picker that hid a refreshable provider would look
 * signed-out when it is not.
 */
export class CredentialGatedAdapter extends PiAiAdapter {
  constructor(
    options: PiAiAdapterOptions,
    private readonly hasCredential: (provider: string) => Promise<boolean>,
  ) {
    super(options)
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (!(await this.hasCredential(provider))) return []
    return super.listModels(provider)
  }
}

