import { cp, lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const manifestPath = join(projectRoot, 'package.json')
const bundledPackages = [
  'command',
  'connection',
  'core',
  'manifest',
  'messages',
  'presentation',
  'storage',
]
// The bundled auth package uses the fork's scoped name. Development links to
// the `dsh-auth/` submodule.
const dshAuthName = '@askdkc/dsh-auth'

const [command, ...args] = process.argv.slice(2)
if (command === undefined) throw new Error('usage: node with-publish-manifest.mjs <command> [args...]')

const originalManifest = await readFile(manifestPath)
const manifest = JSON.parse(originalManifest)
manifest.optionalDependencies ??= {}
for (const packageName of bundledPackages) {
  const name = `@dsh-std/${packageName}`
  const packageManifest = JSON.parse(await readFile(
    join(projectRoot, 'vendor', 'dsh-std', 'packages', packageName, 'package.json'),
  ))
  delete manifest.dependencies?.[name]
  manifest.optionalDependencies[name] = packageManifest.version
}
// dsh-auth rides the same bundle: the repo develops against a `link:` to the
// submodule, but a published manifest cannot carry a link spec — the version
// plus bundledDependencies ships its compiled content in-tarball instead.
const dshAuthDir = join(projectRoot, 'dsh-auth')
const dshAuthInstalled = join(projectRoot, 'node_modules', dshAuthName)
const dshAuthManifest = JSON.parse(await readFile(join(dshAuthDir, 'package.json')))
delete manifest.dependencies?.[dshAuthName]
manifest.optionalDependencies[dshAuthName] = dshAuthManifest.version

// This progress fork is developed as a workspace link until its own package is
// published. Bundle the compiled copy so a dsh-cli tarball installs today.
const activityDir = join(projectRoot, 'vendor', 'dsh-working-activity')
const activityInstalled = join(projectRoot, 'node_modules', 'dsh-working-activity')
const activityManifest = JSON.parse(await readFile(join(activityDir, 'package.json')))
delete manifest.dependencies?.['dsh-working-activity']
manifest.optionalDependencies['dsh-working-activity'] = activityManifest.version

/**
 * Stage one linked dependency for packing. npm pack otherwise follows the
 * workspace link into its installed dependencies; the bundle must contain
 * only the package's publishable files. Restore the link even if copying fails.
 */
const stageBundledPackage = async (sourceDir, installedPath, packageManifest, bundledName = packageManifest.name) => {
  const installed = await lstat(installedPath).catch(() => undefined)
  if (installed === undefined || !installed.isSymbolicLink()) return () => {}
  await rm(installedPath, { recursive: true, force: true })
  const entries = new Set([
    'package.json',
    'LICENSE',
    'README.md',
    ...(Array.isArray(packageManifest.files) ? packageManifest.files : []),
  ])
  const restore = async () => {
    await rm(installedPath, { recursive: true, force: true })
    await mkdir(dirname(installedPath), { recursive: true })
    await symlink(sourceDir, installedPath, process.platform === 'win32' ? 'junction' : 'dir')
  }
  try {
    await mkdir(installedPath, { recursive: true })
    for (const entry of entries) {
      const from = join(sourceDir, entry)
      if (!existsSync(from)) continue
      await cp(from, join(installedPath, entry), { recursive: true })
    }
    // npm/Bun identify bundles by the dependency key. The workspace fork has
    // a scoped name, while the existing runtime imports the unscoped alias.
    await writeFile(join(installedPath, 'package.json'), `${JSON.stringify({
      ...packageManifest,
      name: bundledName,
    }, null, 2)}\n`)
  } catch (error) {
    await restore()
    throw error
  }
  return restore
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
const restorers = []
try {
  restorers.push(await stageBundledPackage(dshAuthDir, dshAuthInstalled, dshAuthManifest))
  restorers.push(await stageBundledPackage(activityDir, activityInstalled, activityManifest, 'dsh-working-activity'))
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  for (const restore of restorers.reverse()) await restore()
  await writeFile(manifestPath, originalManifest)
}
