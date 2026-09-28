/** Check local Kiokuko identity without opening its database or changing bindings. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function verifyKiokukoBinding(root) {
  let raw
  try {
    raw = readFileSync(resolve(root, '.kiokuko.json'), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return 'SKIP: no local .kiokuko.json'
    throw error
  }
  const binding = JSON.parse(raw)
  const instructions = readFileSync(resolve(root, 'AGENTS.md'), 'utf8')
  const block = instructions.match(/<!-- BEGIN KIOKUKO MANAGED BLOCK -->([\s\S]*?)<!-- END KIOKUKO MANAGED BLOCK -->/u)?.[1]
  if (!block) throw new Error('AGENTS.md has no Kiokuko managed block')
  for (const [field, label] of [['repositoryId', 'Repository ID'], ['workspace', 'Workspace']]) {
    const matches = [...block.matchAll(new RegExp('^- ' + label + ': `([^`]+)`\\s*$', 'gm'))]
    if (matches.length !== 1) throw new Error(`AGENTS.md must declare exactly one ${label}`)
    if (binding?.[field] !== matches[0][1]) {
      throw new Error(`Kiokuko ${field} mismatch between .kiokuko.json and AGENTS.md; confirm the intended project before rebinding`)
    }
  }
  return 'PASS: local Kiokuko identity matches AGENTS.md'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(verifyKiokukoBinding(fileURLToPath(new URL('../', import.meta.url))))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
