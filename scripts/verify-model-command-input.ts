/** /model completion must preserve free-form orderless search text. Run: node --import tsx/esm scripts/verify-model-command-input.ts */
import assert from 'node:assert/strict'
import { createCommandCompletions } from '../src/dsh-adapter/channel/command-completions.js'

const completions = createCommandCompletions({
  state: () => ({ commandList: [] }) as never,
  themeHost: undefined as never,
  workspaceCommands: () => [],
  model: {
    warmModelNodes: () => {}, modelNodes: () => [{ name: 'deepseek/deepseek-v4' }],
    warmPresetOptions: () => {}, presetOptions: () => [], warmEffortLevels: () => {},
  },
})
for (const input of ['/model', '/model ', '/model seek deep', '/model openai/gpt-5']) {
  const rows = completions(input)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.commandLine, input)
  assert.equal(rows[0]?.replacement, input)
}
console.log('verify-model-command-input: passed')
