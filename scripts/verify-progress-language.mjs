/** Exercise the published progress projection with admitted user events. */
import assert from 'node:assert/strict'
import { createActivityProjection } from '../vendor/dsh-working-activity/lib/types/projection.js'
import { detectInputLanguage } from '../vendor/dsh-working-activity/lib/types/lang.js'
import { createChannelProjection } from '../src/dsh-adapter/channel/projection.js'
import { progressSpinnerVerb, progressText, setLang } from '../src/i18n.js'

assert.equal(detectInputLanguage('ログを確認してください'), 'ja')
assert.equal(detectInputLanguage('ﾛｸﾞを確認して'), 'ja')
assert.equal(detectInputLanguage('Please inspect the logs'), 'en')
assert.equal(detectInputLanguage('请检查这个文件内容'), 'zh')
assert.equal(detectInputLanguage('確認'), undefined)
assert.equal(detectInputLanguage('OK'), undefined)
assert.equal(detectInputLanguage('`日本語のコード` Please inspect the logs'), 'en')
assert.equal(detectInputLanguage('> これは引用です\nPlease inspect the logs'), 'en')
assert.equal(detectInputLanguage('```\n日本語のコード\n```\nPlease inspect the logs'), 'en')
assert.equal(detectInputLanguage('C:\\Users\\日本語\\file.txt Please inspect the logs'), 'en')
setLang('zh')
assert.equal(progressSpinnerVerb('ja', 'Working'), '作業中')
assert.equal(progressSpinnerVerb('en', 'Working'), 'Working')
assert.equal(progressText('ja', 'thoughtFor', { seconds: 3 }), '3 秒思考')

const previousLocale = process.env.LC_ALL
process.env.LC_ALL = 'en_US.UTF-8'
let clock = 1000
const input = createActivityProjection({
  trackerConfig: { phrases: true, detailLimit: 40, showIdle: false, inputLanguage: true },
  lang: () => 'zh',
  now: () => clock,
})
const user = (text, source = 'user') => ({
  type: 'user/message', time: ++clock,
  data: { source: { kind: source }, content: [{ type: 'text', text }] },
})
const event = (type, data = {}) => ({ type, time: ++clock, data })
const fold = (state, next) => input.apply(state, next)

let japanese = input.init()
let english = input.init()
assert.equal(input.view(japanese).lang, 'en')
process.env.LC_ALL = 'ja_JP.UTF-8'
assert.equal(input.view(input.init()).lang, 'ja', 'first ambiguous turn uses the terminal locale')
process.env.LC_ALL = 'en_US.UTF-8'
japanese = fold(japanese, user('ログを確認してください'))
assert.equal(input.view(japanese).lang, 'ja')
assert.equal(input.view(english).lang, 'en', 'another session keeps its own language')
japanese = fold(japanese, event('turn/start'))
assert.match(input.view(japanese).line, /モデル|待/)
japanese = fold(japanese, event('tool/call', { callId: 't1', name: 'natural-japanese-output', arguments: '{}' }))
assert.match(input.view(japanese).line, /ツール実行/)
assert.doesNotMatch(input.view(japanese).line, /备选方案/)
japanese = fold(japanese, event('approval/asked'))
assert.match(input.view(japanese).line, /承認待ち/)
const unchanged = fold(japanese, user('画像内の文章', 'plugin'))
assert.equal(unchanged, japanese, 'non-human content is not folded')
const imageOnly = fold(japanese, {
  type: 'user/message', time: ++clock,
  data: { source: { kind: 'user' }, content: [{ type: 'image' }] },
})
assert.equal(imageOnly, japanese, 'image-only input retains the language')
japanese = fold(japanese, user('確認'))
assert.equal(input.view(japanese).lang, 'ja', 'ambiguous input retains language')
japanese = fold(japanese, event('tool/result', { callId: 't1', result: 'ok' }))
assert.match(input.view(japanese).line, /ツール実行/)
japanese = fold(japanese, event('turn/end', { reason: { kind: 'completed' } }))
assert.match(input.view(japanese).line, /完了/)
const resumedJapanese = structuredClone(japanese)
assert.equal(input.view(resumedJapanese).lang, 'ja', 'serialized projection restores its language')
japanese = fold(japanese, user('Please inspect the logs'))
assert.equal(input.view(japanese).lang, 'en')
assert.match(input.view(japanese).line, /Finished/, 'a finished card follows a new request language')
japanese = fold(japanese, user('请检查这个文件内容'))
assert.equal(input.view(japanese).lang, 'zh')
assert.doesNotMatch(input.view(japanese).line, /ツール実行|Finished/)

english = fold(english, user('Please inspect the logs'))
assert.equal(input.view(english).lang, 'en')
english = fold(english, user('请检查这个文件内容'))
assert.equal(input.view(english).lang, 'zh')
assert.equal(input.view(japanese).lang, 'zh', 'background session cannot change foreground language')
const resumed = structuredClone(japanese)
assert.equal(input.view(resumed).lang, 'zh', 'serialized projection restores its latest language')
const corrupt = structuredClone(japanese)
corrupt.tracker.progressLang = 'invalid'
assert.equal(input.view(corrupt).lang, 'en', 'a corrupt locale checkpoint safely refolds')

// The TUI's fallback spinner reads the same language from its admitted-event projection.
const channel = {
  rows: [], progressLanguage: 'en', lastUserText: '',
  contextSegments: { system: 0, prompt: 0, assistant: 0, thinking: 0, tools: 0 },
}
const projector = createChannelProjection(channel, {
  rowIds: { value: 0 },
  selectionAttached: () => undefined,
})
projector.renderEvent(user('ログを確認してください'))
assert.equal(channel.progressLanguage, 'ja')
projector.renderEvent(user('> 请检查这个文件内容\n確認'))
assert.equal(channel.progressLanguage, 'ja', 'quoted text cannot change the fallback spinner')
projector.renderEvent(user('Please inspect the logs'))
assert.equal(channel.progressLanguage, 'en')
projector.renderEvent(user('请检查这个文件内容'))
assert.equal(channel.progressLanguage, 'zh')
projector.renderEvent(user('確認'))
assert.equal(channel.progressLanguage, 'zh')
projector.renderEvent(user('Please inspect the logs', 'plugin'))
assert.equal(channel.progressLanguage, 'zh', 'injected content is ignored')

if (previousLocale === undefined) delete process.env.LC_ALL
else process.env.LC_ALL = previousLocale
console.log('verify-progress-language: OK')
