/**
 * CI gate for the upstream compatibility contract: fails when any blessed
 * official package is installed at a version other than the validated
 * release line, so a mismatched install breaks CI before user machines.
 *
 * Run via `node --import tsx/esm scripts/verify-upstream-contract.ts`.
 */
import assert from 'node:assert/strict'

const {
  installedUpstreamLines,
  upstreamDrift,
  upstreamDriftSummary,
  UPSTREAM_BLESSED_PACKAGES,
  UPSTREAM_FRAMEWORK_MAJORS,
  UPSTREAM_VALIDATED_LABEL,
  UPSTREAM_VALIDATED_VERSION,
  UPSTREAM_VALIDATED_VERSIONS,
} = await import('../src/dsh-adapter/contract.js')

assert.deepEqual(UPSTREAM_VALIDATED_VERSIONS, [UPSTREAM_VALIDATED_VERSION])
assert.equal(UPSTREAM_VALIDATED_LABEL, UPSTREAM_VALIDATED_VERSION)
const currentVersions: Record<string, string | undefined> = Object.fromEntries(UPSTREAM_BLESSED_PACKAGES.map(name => [
  name, UPSTREAM_FRAMEWORK_MAJORS[name] === 4 ? '4.0.4'
    : UPSTREAM_FRAMEWORK_MAJORS[name] === 3 ? '3.18.3' : UPSTREAM_VALIDATED_VERSION,
]))
assert.deepEqual(upstreamDrift(currentVersions), [])
assert.equal(upstreamDriftSummary(currentVersions), undefined)
for (const version of ['0.1.5-alpha.2', '0.1.7-rc.2', '0.2.0-rc.1']) {
  const old = { ...currentVersions, '@deepseek-ai/dsh-agent': version }
  assert.equal(upstreamDrift(old).length, 1, `${version} is unsupported`)
  assert.equal(upstreamDriftSummary(old)?.kind, 'mixed')
}
const older = Object.fromEntries(Object.entries(currentVersions).map(([name, version]) => [name,
  UPSTREAM_FRAMEWORK_MAJORS[name] === undefined ? '0.1.7-rc.2' : version]))
assert.equal(upstreamDriftSummary(older)?.kind, 'older')
const newer = { ...currentVersions, '@deepseek-ai/dsh-agent': '0.2.0-rc.3' }
assert.equal(upstreamDrift(newer).length, 1)
assert.equal(upstreamDriftSummary(newer)?.kind, 'mixed')
const optionalAbsent = { ...currentVersions, '@deepseek-ai/dsh-agent-preset-registry': undefined }
assert.equal(upstreamDriftSummary(optionalAbsent), undefined)
assert.equal(upstreamDrift(optionalAbsent).length, 1, 'CI still requires dev dependencies')
assert.equal(upstreamDriftSummary({ ...currentVersions, '@deepseek-ai/dsh-agent': undefined })?.kind, 'broken')
assert.equal(upstreamDriftSummary({ ...currentVersions, '@deepseek-ai/dsh-agent': 'invalid' })?.kind, 'broken')
assert.equal(upstreamDriftSummary({ ...currentVersions, '@deepseek-ai/cordis': '5.0.0' })?.kind, 'broken')
const installedLines = installedUpstreamLines()
const drift = upstreamDrift()
if (installedLines.length > 1) {
  console.error(`Upstream contract violated (mixed harness lines: ${installedLines.join(', ')})`)
}
if (drift.length > 0) {
  console.error(`Upstream contract violated (validated: ${UPSTREAM_VALIDATED_LABEL}):`)
  for (const entry of drift) {
    console.error(`  - ${entry.package}: installed=${entry.installed ?? 'missing'}`)
  }
}
if (installedLines.length > 1 || drift.length > 0) process.exit(1)
console.log(`upstream contract OK (validated: ${UPSTREAM_VALIDATED_LABEL})`)
