import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyKiokukoBinding } from './verify-kiokuko-binding.mjs'

test('optional local binding rejects copied identities without rewriting files', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-kiokuko-binding-'))
  try {
    assert.match(verifyKiokukoBinding(root), /^SKIP:/)
    const instructions = '<!-- BEGIN KIOKUKO MANAGED BLOCK -->\n- Repository ID: `repo_current`\n- Workspace: `project:current`\n<!-- END KIOKUKO MANAGED BLOCK -->\n'
    writeFileSync(join(root, 'AGENTS.md'), instructions)
    const writeBinding = value => writeFileSync(join(root, '.kiokuko.json'), JSON.stringify(value))
    writeBinding({ repositoryId: 'repo_old', workspace: 'project:old' })
    assert.throws(() => verifyKiokukoBinding(root), /repositoryId mismatch/)
    writeBinding({ repositoryId: 'repo_current', workspace: 'project:old' })
    assert.throws(() => verifyKiokukoBinding(root), /workspace mismatch/)
    writeBinding({ repositoryId: 'repo_current', workspace: 'project:current' })
    assert.match(verifyKiokukoBinding(root), /^PASS:/)
    writeFileSync(join(root, '.kiokuko.json'), '{')
    assert.throws(() => verifyKiokukoBinding(root), SyntaxError)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
