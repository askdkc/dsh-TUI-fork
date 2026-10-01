/** Exercise the real scoped DSH assembler, including its complete-persona enforcement. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as personaPlugin from '@deepseek-ai/dsh-persona'
import { createScope } from '@deepseek-ai/dsh-scope'
import { parse } from 'yaml'
import { registerBundledPresets } from '../lib/types/dsh-adapter/bundled-presets.js'
import { registerResponseLanguage, RESPONSE_LANGUAGE_POLICY as policy } from '../lib/types/dsh-adapter/response-language.js'
import { wrapSideQuestion } from '../lib/types/dsh-adapter/sideQuestion.js'
import { collectRecentActivity, wrapRecapPrompt } from '../lib/types/dsh-adapter/recap.js'
import * as activityPlugin from '../vendor/dsh-working-activity/lib/types/index.js'
import { NARRATE_INSTRUCTION, detectLocaleLang as activityLocale } from '../vendor/dsh-working-activity/lib/types/lang.js'
import { detectLocaleLang as uiLocale } from '../lib/types/i18n.js'
import { settled } from './lib/term-test.mjs'

const definitions = []
const fake = baseUrl => ({
  baseUrl, get: name => name === 'agentPresets' ? { register: async d => { definitions.push(d); return () => {} } } : undefined,
  extend: ({ baseUrl }) => fake(baseUrl), effect: fn => fn(),
})
await registerBundledPresets(fake(new URL('../cordis.patch.yml', import.meta.url).href))
const liangshenUrl = new URL('../presets/liangshen/agent.cordis.yml', import.meta.url)
const liangshenRows = parse(readFileSync(liangshenUrl, 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => ({ expression: value }) }] })
const liangshenPersona = new Function('ctx', `return (${liangshenRows.find(r => r.id === 'persona').config.expression})`)({ baseUrl: liangshenUrl.href })
const originalLocale = Object.fromEntries(['LC_ALL', 'LC_MESSAGES', 'LANG'].map(k => [k, process.env[k]]))
try {
  for (const locale of ['ja_JP.UTF-8', 'zh_CN.UTF-8', 'en_US.UTF-8', 'fr_FR.UTF-8', '']) {
    process.env.LC_ALL = locale; delete process.env.LC_MESSAGES; delete process.env.LANG
    assert.equal(uiLocale(), locale.startsWith('zh') ? 'zh' : 'en')
    assert.equal(activityLocale(), locale.startsWith('zh') ? 'zh' : 'en')
    for (const definition of definitions) {
      const config = definition.id === 'liangshen' ? liangshenPersona : definition.plugins.find(p => p.id === 'persona').config
      const ctx = new Context()
      try {
        await ctx.plugin(SystemPrompt, { personaPrefix: 'A custom deployment persona without a language rule.' })
        registerResponseLanguage(ctx)
        assert.ok(await settled(() => ctx.get('systemPrompt') !== undefined))
        let selectedModel = 'muse-spark-1.3-contributor'
        ctx.systemPrompt.variable('model', () => selectedModel)
        ctx.systemPrompt.variable('cwd', () => '/isolated/workspace')
        await ctx.plugin(activityPlugin, { lang: 'input', narrate: true, publish: false })
        const key = {}
        const scope = createScope(ctx, key)
        await scope.ctx.plugin(personaPlugin, config)
        for (const model of ['muse-spark-1.3-contributor', 'another-model']) {
          selectedModel = model
          const assembly = await ctx.systemPrompt.assemble({ scope: key })
          const text = renderPrompt(assembly)
          assert.equal(text.split(policy).length - 1, 1, `${definition.id}: policy survives scoped persona exactly once`)
          assert.doesNotMatch(text, /状态栏|必须|最前面/)
          if (config.complete) assert.equal(assembly.sections.length, 1, 'complete persona remains complete')
          else assert.ok(text.includes(NARRATE_INSTRUCTION), 'real activity plugin supplies locale-independent instructions')
          const childKey = {}
          const child = createScope(ctx, childKey, { parent: key })
          assert.ok(renderPrompt(await ctx.systemPrompt.assemble({ scope: childKey })).includes(policy), `${definition.id}: child inherits policy`)
          await child.dispose()
        }
        await scope.dispose()
        // A user-owned complete prompt remains an intentional full replacement.
        const customKey = {}; const custom = createScope(ctx, customKey)
        await custom.ctx.plugin(personaPlugin, { prefix: 'User owned prompt', complete: true })
        assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: customKey })), 'User owned prompt')
        await custom.dispose()
      } finally { await ctx.fiber.dispose() }
    }
  }
} finally {
  for (const [k,v] of Object.entries(originalLocale)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
}
for (const input of ['chinn korone', 'OK', '123', '`code`', '日本語で答えて', '请用中文回答', '> 中文引用\nchinn korone']) {
  const wrapped = wrapSideQuestion(input)
  assert.ok(wrapped.includes(policy)); assert.ok(wrapped.endsWith(input))
}
const event = (kind, text) => ({ type: 'user/message', data: { source: { kind }, content: [{ type: 'text', text }] } })
const activity = collectRecentActivity([event('plugin', '中文注入'), event('user', 'chinn korone')], 6000)
assert.doesNotMatch(activity, /中文注入/)
assert.match(activity, /user: chinn korone/)
assert.ok(wrapRecapPrompt(activity).includes(policy))
console.log('verify-response-language: OK (real DSH assembly; no live model inference)')
