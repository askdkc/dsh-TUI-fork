import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/opencode-sdk.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../lib/opencode-sdk.js', import.meta.url)),
  metafile: true, bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true,
})

// Preserve notices for every actual bundled dependency, including transitives.
const notices = new Map()
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue
  let directory = dirname(resolve(input))
  while (directory.includes('node_modules')) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (manifest.name) {
        const license = await readFile(join(directory, 'LICENSE'), 'utf8').catch(async error => {
          if (error.code !== 'ENOENT' || manifest.license !== 'Apache-2.0') throw error
          return readFile(new URL('../node_modules/@ai-sdk/provider/LICENSE', import.meta.url), 'utf8')
        })
        notices.set(manifest.name, `${manifest.name}@${manifest.version} (${manifest.license})\n${license}`)
        break
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    directory = dirname(directory)
  }
}
await writeFile(new URL('../lib/THIRD_PARTY_NOTICES.txt', import.meta.url), [...notices.values()].join('\n\n---\n\n') + '\n')
