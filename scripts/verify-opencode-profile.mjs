/** Real DSH plugin install/upgrade acceptance, isolated from user profiles. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const piVersion = process.env.DSH_AUTH_TEST_PI ?? '0.87.1'
assert(['0.87.1', '0.99.1'].includes(piVersion))
const directory = await mkdtemp(join(tmpdir(), 'dsh-opencode-profile-'))
const host = process.env.DSH_AUTH_TEST_HOST ? resolve(process.env.DSH_AUTH_TEST_HOST) : join(directory, 'host')
const home = join(directory, 'home')
const node = process.env.DSH_AUTH_TEST_NODE ?? process.execPath
const env = { ...process.env, DSH_HOME: home, DSH_AUTH_CREDENTIALS: join(home, 'dsh-auth', 'credentials.json'), DSH_TELEMETRY_DISABLED: '1', CI: 'true' }
const run = (command, args, cwd = host, extra = {}) => {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' && (command === 'npm' || command === 'pnpm') })
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout || result.error}`)
  return result.stdout + (args.includes('--json') ? '' : result.stderr)
}
const cli = join(host, 'node_modules', '@deepseek-ai/dsh', 'lib', 'bin.js')
try {
  if (!process.env.DSH_AUTH_TEST_HOST) {
    const { mkdir } = await import('node:fs/promises'); await mkdir(host)
    await writeFile(join(host, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@deepseek-ai/dsh': '0.2.0-rc.2' }, overrides: { '@earendil-works/pi-ai': piVersion, '@deepseek-ai/cordis': '4.0.1' } }))
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
  }
  const manifest = JSON.parse(await readFile(join(root, 'package.json')))
  const authManifest = JSON.parse(await readFile(join(root, 'dsh-auth', 'package.json')))
  // Packing consumes the same build outputs CI already verified; no source links.
  const packed = run(node, [join(root, 'scripts/with-publish-manifest.mjs'), 'npm', 'pack', '--json', '--ignore-scripts', '--pack-destination', directory], root)
  const tarball = join(directory, JSON.parse(packed)[0].filename)
  run(node, [cli, 'plugin', '--profile', 'dsh-cli', 'add', '@askdkc/dsh-cli@0.12.3'])
  const carrier = join(home, 'profiles', 'dsh-cli', 'node_modules', '@askdkc/dsh-cli')
  const auth = join(carrier, 'node_modules', '@askdkc/dsh-auth')
  // Real profile boot with only the registry, commands and auth enabled. TUI
  // rendering, shells and live API keys are deliberately separate acceptance.
  const probe = join(host, `probe-${Date.now()}.mjs`)
  await writeFile(probe, await readFile(new URL('./opencode-profile-probe.mjs', import.meta.url), 'utf8'))
  const baseline = run(node, [probe], host, { DSH_AUTH_TEST_PHASE: 'baseline', DSH_AUTH_TEST_PI: piVersion })
  if (piVersion === '0.87.1') assert.match(baseline, /snapshot opencode\/claude-sonnet-5-5.*neither metadata nor a fallback marker/)
  run(node, [cli, 'plugin', '--profile', 'dsh-cli', 'add', `@askdkc/dsh-cli@file:${tarball}`])
  assert.equal(JSON.parse(await readFile(join(carrier, 'package.json'))).version, manifest.version)
  assert.equal(JSON.parse(await readFile(join(auth, 'package.json'))).version, authManifest.version)
  assert.equal(JSON.parse(await readFile(join(auth, 'dsh-plugin.json'))).version, authManifest.version)
  assert.doesNotMatch(run(node, [probe], host, { DSH_AUTH_TEST_PHASE: 'updated', DSH_AUTH_TEST_PI: piVersion }), /did not activate/)
  run(node, ['--loader', join(root, 'dsh-auth/scripts/reject-pi-loader.mjs'), probe], host, { DSH_AUTH_TEST_PHASE: 'independent' })
  console.log(`DSH 0.2.0-rc.2 / pi ${piVersion}: public baseline, formal upgrade to cli ${manifest.version}/auth ${authManifest.version}, 9 routes, pi-free profile and installed wire fixture OK`)
  await rm(probe, { force: true })
} finally { await rm(directory, { recursive: true, force: true }) }
