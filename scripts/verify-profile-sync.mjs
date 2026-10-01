#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixture = mkdtempSync(join(tmpdir(), 'dsh-cli-profile-sync-'))
const installed = join(fixture, 'profiles/dsh-cli/node_modules/@askdkc/dsh-cli')
const auth = join(installed, 'node_modules/@askdkc/dsh-auth')
const snapshot = join(auth, 'lib/opencode-owned.generated.js')
const expected = readFileSync(join(root, 'dsh-auth/lib/opencode-owned.generated.js'))
const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/sync-profile.mjs'), ...args], {
  cwd: root,
  env: { ...process.env, DSH_HOME: fixture },
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})

try {
  mkdirSync(dirname(snapshot), { recursive: true })
  writeFileSync(join(installed, 'package.json'), readFileSync(join(root, 'package.json')))
  writeFileSync(snapshot, 'stale snapshot\n')
  const dependency = join(auth, 'node_modules/user-owned.txt')
  mkdirSync(dirname(dependency), { recursive: true })
  writeFileSync(dependency, 'preserve dependency\n')
  const settings = join(fixture, 'settings.yaml')
  writeFileSync(settings, 'preserve settings\n')

  const first = run()
  assert.equal(first.status, 0, first.stderr)
  assert.equal(Buffer.compare(readFileSync(snapshot), expected), 0, 'sync must update the bundled auth snapshot')
  assert.equal(Buffer.compare(readFileSync(join(auth, 'lib/index.js')), readFileSync(join(root, 'dsh-auth/lib/index.js'))), 0)

  writeFileSync(snapshot, 'stale snapshot\n')
  const check = run('--check')
  assert.equal(check.status, 2, check.stderr)
  assert.match(check.stdout, /node_modules[\\/]@askdkc[\\/]dsh-auth[\\/]lib[\\/]opencode-owned\.generated\.js/u)
  assert.equal(readFileSync(snapshot, 'utf8'), 'stale snapshot\n', '--check must not write')

  const updated = run()
  assert.equal(updated.status, 0, updated.stderr)
  assert.equal(Buffer.compare(readFileSync(snapshot), expected), 0)
  assert.equal(run('--check').status, 0, 'a repeated sync check must be clean')
  assert.equal(readFileSync(dependency, 'utf8'), 'preserve dependency\n')
  assert.equal(readFileSync(settings, 'utf8'), 'preserve settings\n')
  console.log('profile sync OK (bundled auth, read-only check, idempotence, preserved dependencies/settings)')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
