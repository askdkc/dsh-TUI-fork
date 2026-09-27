/** Isolated shell-registration regression. Run: node --import tsx/esm scripts/verify-cli-registration.ts */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureCliRegistered } from '../src/dsh-adapter/cli-registration.js'

const home = mkdtempSync(join(tmpdir(), 'dsh-cli-register-'))
const dshHome = join(home, "dsh 'home")
const target = join(dshHome, 'profiles', 'dsh-cli', 'node_modules', '@askdkc', 'dsh-cli', 'bin')
mkdirSync(target, { recursive: true })
writeFileSync(join(target, '..', 'package.json'), JSON.stringify({ name: '@askdkc/dsh-cli' }))
writeFileSync(join(target, 'dsh-tui.js'), 'if (process.argv[2] === "signal") setInterval(() => {}, 1000); else { console.log(process.argv.slice(2).join("|")); process.exit(7) }\n')
writeFileSync(join(home, '.zshrc'), '# user setting\n')
const options = { home, dshHome, shell: '/bin/zsh', path: '', platform: 'darwin' as const }
const result = ensureCliRegistered(options)
assert.match(result, /Registered/)
const command = join(home, '.local', 'bin', 'dsh-cli')
assert.equal(existsSync(command), true)
assert.equal(readFileSync(join(home, '.zshrc'), 'utf8').match(/BEGIN dsh-cli managed PATH/g)?.length, 1)
const before = readFileSync(join(home, '.zshrc'), 'utf8')
ensureCliRegistered(options)
assert.equal(readFileSync(join(home, '.zshrc'), 'utf8'), before)

const shell = spawnSync('zsh', ['-ic', 'command -v dsh-cli'], {
  env: { ...process.env, ZDOTDIR: home, PATH: process.env.PATH ?? '' }, encoding: 'utf8',
})
if (shell.error?.code === 'ENOENT') {
  console.log('zsh startup check skipped: zsh is not installed')
} else {
  assert.ifError(shell.error)
  assert.equal(shell.status, 0, shell.stderr)
  assert.equal(shell.stdout.trim(), command)
}
const launched = spawnSync(command, ['help', 'a b'], { env: { ...process.env, DSH_HOME: dshHome }, encoding: 'utf8' })
assert.equal(launched.status, 7)
assert.equal(launched.stdout.trim(), 'help|a b')
const signaled = spawnSync(command, ['signal'], { env: { ...process.env, DSH_HOME: dshHome }, timeout: 150, killSignal: 'SIGTERM' })
assert.equal(signaled.signal, 'SIGTERM')
const defaultHome = spawnSync(command, ['version'], { env: { ...process.env, DSH_HOME: '' }, encoding: 'utf8' })
assert.equal(defaultHome.status, 7)
assert.equal(defaultHome.stdout.trim(), 'version')
const otherDshHome = join(home, 'another dsh home')
const otherTarget = join(otherDshHome, 'profiles', 'dsh-cli', 'node_modules', '@askdkc', 'dsh-cli', 'bin')
mkdirSync(otherTarget, { recursive: true })
writeFileSync(join(otherTarget, '..', 'package.json'), JSON.stringify({ name: '@askdkc/dsh-cli' }))
writeFileSync(join(otherTarget, 'dsh-tui.js'), 'console.log("another|" + process.argv.slice(2).join("|")); process.exit(9)\n')
const originalLauncher = readFileSync(command, 'utf8')
assert.match(ensureCliRegistered({ ...options, dshHome: otherDshHome }), /original DSH_HOME default/)
assert.equal(readFileSync(command, 'utf8'), originalLauncher)
const overridden = spawnSync(command, ['version'], { env: { ...process.env, DSH_HOME: otherDshHome }, encoding: 'utf8' })
assert.equal(overridden.status, 9)
assert.equal(overridden.stdout.trim(), 'another|version')

const other = join(home, 'other')
mkdirSync(join(other, '.local', 'bin'), { recursive: true })
const collision = join(other, '.local', 'bin', 'dsh-cli')
writeFileSync(collision, 'user command')
assert.throws(() => ensureCliRegistered({ ...options, home: other }), /belongs to another command/)
assert.equal(readFileSync(collision, 'utf8'), 'user command')
const foreignBin = join(home, 'foreign-bin')
mkdirSync(foreignBin)
writeFileSync(join(foreignBin, 'dsh-cli'), 'another command')
const noShadowHome = join(home, 'no-shadow')
assert.match(ensureCliRegistered({ ...options, home: noShadowHome, path: foreignBin }), /automatic registration skipped/)
assert.equal(existsSync(join(noShadowHome, '.local', 'bin', 'dsh-cli')), false)

const linkHome = join(home, 'linked')
mkdirSync(join(linkHome, '.local', 'bin'), { recursive: true })
const actual = join(linkHome, 'actual-zshrc')
writeFileSync(actual, '# retained\n')
chmodSync(actual, 0o640)
symlinkSync(actual, join(linkHome, '.zshrc'))
ensureCliRegistered({ ...options, home: linkHome })
assert.equal(lstatSync(join(linkHome, '.zshrc')).isSymbolicLink(), true)
assert.match(readFileSync(actual, 'utf8'), /# retained/)
assert.equal(statSync(actual).mode & 0o777, 0o640)

const malformedHome = join(home, 'malformed')
mkdirSync(malformedHome)
writeFileSync(join(malformedHome, '.zshrc'), '# BEGIN dsh-cli managed PATH\n')
assert.throws(() => ensureCliRegistered({ ...options, home: malformedHome }), /malformed dsh-cli PATH block/)
assert.equal(readFileSync(join(malformedHome, '.zshrc'), 'utf8'), '# BEGIN dsh-cli managed PATH\n')

const lockedHome = join(home, 'locked')
mkdirSync(join(lockedHome, '.local', 'bin'), { recursive: true })
writeFileSync(join(lockedHome, '.local', 'bin', '.dsh-cli-registration.lock'), '')
assert.throws(() => ensureCliRegistered({ ...options, home: lockedHome }), /already running/)

const bashHome = join(home, 'bash')
mkdirSync(bashHome)
writeFileSync(join(bashHome, '.profile'), '# login preference\n')
ensureCliRegistered({ ...options, home: bashHome, shell: '/bin/bash', path: join(bashHome, '.local', 'bin') })
assert.match(readFileSync(join(bashHome, '.bashrc'), 'utf8'), /BEGIN dsh-cli managed PATH/)
assert.match(readFileSync(join(bashHome, '.profile'), 'utf8'), /BEGIN dsh-cli managed PATH/)
assert.equal(existsSync(join(bashHome, '.bash_profile')), false)
for (const startup of ['-ic', '-lc']) {
  const bash = spawnSync('bash', [startup, 'command -v dsh-cli'], {
    env: { ...process.env, HOME: bashHome, PATH: process.env.PATH ?? '' }, encoding: 'utf8',
  })
  assert.ifError(bash.error)
  assert.equal(bash.status, 0, bash.stderr)
  assert.equal(bash.stdout.trim(), join(bashHome, '.local', 'bin', 'dsh-cli'))
}

const fishHome = join(home, 'fish')
ensureCliRegistered({ ...options, home: fishHome, shell: '/usr/bin/fish' })
assert.match(readFileSync(join(fishHome, '.config', 'fish', 'conf.d', 'dsh-cli.fish'), 'utf8'), /contains --/)

const windowsHome = join(home, 'windows')
let userPath = 'C:\\Tools'
let writes = 0
const windowsUserPath = { read: () => userPath, write: (value: string) => { userPath = value; writes++ } }
ensureCliRegistered({ ...options, home: windowsHome, platform: 'win32', localAppData: join(windowsHome, 'Local App Data'), windowsUserPath })
const windowsCommand = join(windowsHome, 'Local App Data', 'dsh-cli', 'bin', 'dsh-cli.cmd')
assert.match(readFileSync(windowsCommand, 'utf8'), /%\*/)
assert.equal(writes, 1)
ensureCliRegistered({ ...options, home: windowsHome, platform: 'win32', localAppData: join(windowsHome, 'Local App Data'), windowsUserPath })
assert.equal(writes, 1)

chmodSync(command, 0o755)
console.log('verify-cli-registration: passed')
