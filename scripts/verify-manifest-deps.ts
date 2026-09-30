/**
 * CI gate for the #198 dependency-classification contract: framework packages
 * (`@deepseek-ai/*`) are host-provided and must never ship as runtime
 * dependencies — a real copy inside a profile shadows the host instance and
 * splits module identity (the TOOL_RUNTIME_SCHEDULER crash). This gate fails
 * the build when the manifest drifts back:
 *
 *   1. neither `dependencies` nor `optionalDependencies` contains an
 *      `@deepseek-ai/*` package (an optional install would still land a real
 *      copy in the profile whenever pnpm can resolve it);
 *   2. every `@deepseek-ai/*` peerDependency is also a devDependency (local
 *      type-check), at the exact same range;
 *   3. every `@deepseek-ai/*` peerDependency is optional, so npm consumers do
 *      not auto-install a second framework tree beside the dsh host;
 *   4. the `@deepseek-ai/*` peer set equals UPSTREAM_BLESSED_PACKAGES, so an
 *      ungated peer (or a blessed package dropped from the manifest) fails
 *      here instead of drifting silently.
 *
 * Run via `node --import tsx/esm scripts/verify-manifest-deps.ts`.
 */
import { readFileSync } from 'node:fs'
import { satisfies } from 'semver'

const { UPSTREAM_BLESSED_PACKAGES, UPSTREAM_VALIDATED_VERSION } = await import('../src/dsh-adapter/contract.js')

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const FRAMEWORK = /^@deepseek-ai\//
const failures: string[] = []

// DSH checks every harness peer before loading a bundle. Optional peers still
// participate, and bundled plugins need the same runtime compatibility.
for (const path of ['../package.json', '../dsh-auth/package.json', '../vendor/dsh-working-activity/package.json']) {
  const plugin = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  for (const [name, range] of Object.entries(plugin.peerDependencies ?? {})) {
    if ((name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
      && (typeof range !== 'string' || !satisfies(UPSTREAM_VALIDATED_VERSION, range, { includePrerelease: true }))) {
      failures.push(`${plugin.name}: ${name} peer range ${range} excludes validated DSH ${UPSTREAM_VALIDATED_VERSION}`)
    }
  }
}

for (const section of ['dependencies', 'optionalDependencies'] as const) {
  for (const name of Object.keys(manifest[section] ?? {})) {
    if (FRAMEWORK.test(name)) {
      failures.push(`${name} is in ${section} — framework packages must be peer + dev only (#198)`)
    }
  }
}

const peers: string[] = Object.keys(manifest.peerDependencies ?? {}).filter((name) => FRAMEWORK.test(name))
for (const name of peers) {
  const peerRange = manifest.peerDependencies[name]
  const devRange = manifest.devDependencies?.[name]
  if (devRange === undefined) {
    failures.push(`${name} is a peerDependency without a matching devDependency (local type-check would break)`)
  } else if (devRange !== peerRange) {
    failures.push(`${name} range mismatch: peer=${peerRange} vs dev=${devRange}`)
  }
  if (manifest.peerDependenciesMeta?.[name]?.optional !== true) {
    failures.push(`${name} is a host-provided peer but is not marked optional (npm would auto-install a second framework tree)`)
  }
}

const blessed = [...UPSTREAM_BLESSED_PACKAGES] as string[]
for (const name of peers.filter((name) => !blessed.includes(name))) {
  failures.push(`${name} is a peer but missing from UPSTREAM_BLESSED_PACKAGES (src/dsh-adapter/contract.ts) — the upstream-contract gate would not catch its drift`)
}
for (const name of blessed.filter((name) => !peers.includes(name))) {
  failures.push(`${name} is in UPSTREAM_BLESSED_PACKAGES but not a peerDependency`)
}

if (failures.length > 0) {
  console.error('Manifest dependency classification violated:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`manifest deps OK (${peers.length} optional framework peers, all mirrored in dev at matching ranges, blessed list in sync)`)
