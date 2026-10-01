import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { packagedPresetRoot } from './packaged-presets.js'

/** One packaged policy for ordinary, complete-persona and auxiliary requests. */
export const RESPONSE_LANGUAGE_POLICY = readFileSync(join(packagedPresetRoot(), 'response-language.txt'), 'utf8').trim()

/** Register independently of the replaceable deployment persona. */
export function registerResponseLanguage(ctx: Context): void {
  ctx.inject(['systemPrompt'], ready => {
    ready.systemPrompt.section({ name: 'dsh-cli:response-language', order: 10300, text: RESPONSE_LANGUAGE_POLICY, interpolate: false })
  })
}
