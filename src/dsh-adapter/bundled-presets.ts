import type { Context } from '@deepseek-ai/cordis'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { packagedPresetRoot } from './packaged-presets.js'

interface PresetLoader {
  entries(): Iterable<{ disabled: boolean; options: { name?: string; config?: unknown } }>
}

/** Preserve the Loader's expressions; only the owning plugin may evaluate them. */
function readPresetPatch(path: string): PresetDefinition {
  const patches: unknown = parse(readFileSync(path, 'utf8'), {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => ({ __jsExpr: value }) }],
  })
  if (Array.isArray(patches) && patches.length === 1) {
    const row = patches[0]?.insert?.[0]
    if (row?.name === '@deepseek-ai/dsh-agent-preset'
      && typeof row.config?.id === 'string' && Array.isArray(row.config.plugins)) {
      return row.config as PresetDefinition
    }
  }
  throw new Error(`dsh-tui: invalid upstream preset declaration: ${path}`)
}

/** Register shipped definitions with the current registry. Profile declarations
 * own their seats even while activating; wait for a late registry through Cordis. */
export async function registerBundledPresets(ctx: Context): Promise<void> {
  if (ctx.get('agentPresets') === undefined) {
    ctx.inject(['agentPresets'], async (ready) => {
      await registerBundledPresets(ready)
    })
    return
  }
  const declared = new Set<string>()
  const loader = ctx.get('loader') as PresetLoader | undefined
  for (const entry of loader?.entries() ?? []) {
    if (entry.disabled || entry.options.name !== '@deepseek-ai/dsh-agent-preset') continue
    const config: unknown = entry.options.config
    if (config !== null && typeof config === 'object' && 'id' in config && typeof config.id === 'string') {
      declared.add(config.id)
    }
  }
  const require = createRequire(ctx.baseUrl ?? import.meta.url)
  for (const id of ['standard', 'ptc', 'minimal', 'cordis']) {
    if (declared.has(id)) continue
    const path = require.resolve(`@deepseek-ai/dsh-web-app/presets/${id}.patch.yml`)
    const owner = ctx.extend({ baseUrl: pathToFileURL(path).href })
    const dispose = await owner.get('agentPresets')!.register(readPresetPatch(path))
    ctx.effect(() => dispose)
  }
  if (!declared.has('liangshen')) {
    const root = join(packagedPresetRoot(), 'liangshen')
    const metadata: Pick<PresetDefinition, 'name' | 'description' | 'order'> = parse(readFileSync(join(root, 'preset.yml'), 'utf8'))
    const dispose = await ctx.get('agentPresets')!.register({
      id: 'liangshen',
      name: metadata.name,
      description: metadata.description,
      order: metadata.order,
      plugins: [{
        id: 'liangshen-plugins',
        name: '@deepseek-ai/cordis-plugin-include',
        config: { path: pathToFileURL(join(root, 'agent.cordis.yml')).href },
      }],
    })
    ctx.effect(() => dispose)
  }
}
