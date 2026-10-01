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
// The bundled auth package keeps its scoped name. Development links to the
// `dsh-auth/` package tracked in this repository.
const dshAuthName = '@askdkc/dsh-auth'

const [command, ...args] = process.argv.slice(2)
if (command === undefined) throw new Error('usage: node with-publish-manifest.mjs <command> [args...]')

const originalManifest = await readFile(manifestPath)
const manifest = JSON.parse(originalManifest)
manifest.optionalDependencies ??= {}
const stdBundles = []
for (const packageName of bundledPackages) {
  const name = `@dsh-std/${packageName}`
  const sourceDir = join(projectRoot, 'vendor', 'dsh-std', 'packages', packageName)
  const packageManifest = JSON.parse(await readFile(
    join(sourceDir, 'package.json'),
  ))
  stdBundles.push({ sourceDir, installedPath: join(projectRoot, 'node_modules', name), packageManifest })
  delete manifest.dependencies?.[name]
  manifest.optionalDependencies[name] = packageManifest.version
}
// dsh-auth rides the same bundle: the repo develops against a local `link:`,
// but a published manifest cannot carry a link spec — the version
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

// npm reads bundled manifests again during upgrades. Workspace ranges there
// fail resolution even though a first installation can unpack the bundle.
const bundledVersions = new Map(stdBundles.map(({ packageManifest }) => [packageManifest.name, packageManifest.version]))
const publishManifest = (packageManifest, bundledName) => {
  const published = { ...packageManifest, name: bundledName }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    if (published[section] === undefined) continue
    published[section] = { ...published[section] }
    for (const [name, range] of Object.entries(published[section])) {
      if (typeof range !== 'string' || !range.startsWith('workspace:')) continue
      const version = bundledVersions.get(name)
      if (version === undefined) throw new Error(`cannot publish unresolved workspace dependency ${name}`)
      published[section][name] = version
    }
  }
  return published
}

/**
 * Stage one linked dependency for packing. npm pack otherwise follows the
 * workspace link into its installed dependencies; the bundle must contain
 * only the package's publishable files. Restore the link even if copying fails.
 */
const stageBundledPackage = async (sourceDir, installedPath, packageManifest, bundledName = packageManifest.name) => {
  const installed = await lstat(installedPath).catch(() => undefined)
  if (installed === undefined || !installed.isSymbolicLink()) {
    throw new Error(`${installedPath} must be a workspace link; run pnpm install --frozen-lockfile before packing`)
  }
  const published = publishManifest(packageManifest, bundledName)
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
    await writeFile(join(installedPath, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)
  } catch (error) {
    await restore()
    throw error
  }
  return restore
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
const restorers = []
try {
  for (const { sourceDir, installedPath, packageManifest } of stdBundles) {
    restorers.push(await stageBundledPackage(sourceDir, installedPath, packageManifest))
  }
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
