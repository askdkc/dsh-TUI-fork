/** Retain the unchanged 0.5.0 Web bundle when building this TUI-focused fork. */
import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const snapshot = join(root, 'client-snapshot')
const output = join(root, 'lib')
mkdirSync(join(output, 'types'), { recursive: true })
cpSync(join(snapshot, 'client.js'), join(output, 'client.js'))
cpSync(join(snapshot, 'client.js.map'), join(output, 'client.js.map'))
cpSync(join(snapshot, 'types', 'client'), join(output, 'types', 'client'), { recursive: true })
