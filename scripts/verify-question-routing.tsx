/** Current question ownership, foreign-agent fallthrough and disposal. */
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { registerQuestionAnswerer } from '../src/dsh-adapter/questions-answerer.js'

const waterfallCtx = new Context()
const owner = { agentId: 'agent-current' }
const tuiAnswer = { answers: [{ id: 'route', selected: ['tui'] }] }
const downstreamAnswer = { answers: [{ id: 'route', selected: ['downstream'] }] }
const redactFlags: boolean[] = []
const claimedByTui: Array<string | undefined> = []
const bindAnswerer = (owner: { agentId: string }) => registerQuestionAnswerer(waterfallCtx, owner, {
  ask: async (request, options) => {
    redactFlags.push(options?.redact === true)
    claimedByTui.push(request.agent === undefined ? undefined : String(request.agent.id))
    return tuiAnswer
  },
})
const disposeAnswerer = bindAnswerer(owner)

interface QuestionRequest {
  questions: Array<{ id: string; question: string }>
  agent?: { id: string }
}

interface QuestionAnswer {
  answers: Array<{ id: string; selected: string[] }>
}

const dispatchQuestion = waterfallCtx.waterfall.bind(waterfallCtx) as unknown as {
  (
    name: 'user-questions/request',
    request: QuestionRequest,
    next: () => Promise<QuestionAnswer>,
  ): Promise<QuestionAnswer>
  (
    target: object,
    name: 'user-questions/request',
    request: QuestionRequest,
    next: () => Promise<QuestionAnswer>,
  ): Promise<QuestionAnswer>
}
const question = { id: 'route', question: 'Who should answer?' }
let nextCalls = 0
const next = async (): Promise<QuestionAnswer> => {
  nextCalls += 1
  return downstreamAnswer
}

const currentAgent = { id: 'agent-current' }
assert.equal(
  await dispatchQuestion(
    scopeTarget(currentAgent, currentAgent),
    'user-questions/request',
    { questions: [question], agent: currentAgent },
    next,
  ),
  tuiAnswer,
  'the current channel agent must be claimed by the TUI answerer',
)
assert.equal(nextCalls, 0, 'claiming the current agent must not enter the downstream chain')

const otherAgent = { id: 'agent-other' }
assert.equal(
  await dispatchQuestion(
    scopeTarget(otherAgent, otherAgent),
    'user-questions/request',
    { questions: [question], agent: otherAgent },
    next,
  ),
  downstreamAnswer,
  'another agent must delegate to the next answerer',
)
assert.equal(nextCalls, 1, 'a foreign agent must call next() exactly once')

assert.equal(
  await dispatchQuestion('user-questions/request', { questions: [question] }, next),
  tuiAnswer,
  'agentless host requests must stay answerable in the TUI (dsh-auth /auth)',
)
assert.equal(nextCalls, 1, 'an agentless request is claimed and must not call next()')
assert.deepEqual(claimedByTui, ['agent-current', undefined],
  'only the current and agentless requests may reach the TUI QuestionStore')

// Ownership is read from channel.agentId per request, not captured at mount.
owner.agentId = 'agent-other'
assert.equal(
  await dispatchQuestion(
    scopeTarget(otherAgent, otherAgent),
    'user-questions/request',
    { questions: [question], agent: otherAgent },
    next,
  ),
  tuiAnswer,
  'agent swaps must update waterfall ownership without re-registering',
)
assert.deepEqual(claimedByTui, ['agent-current', undefined, 'agent-other'])

await dispatchQuestion('user-questions/request', { questions: [{ id: 'dsh-auth-secret', question: 'Key' }] }, next)
assert.equal(redactFlags.at(-1), true, 'auth secrets must be redacted')
assert.equal(redactFlags[0], false, 'ordinary questions are visible')

disposeAnswerer()
assert.equal(
  await dispatchQuestion(
    scopeTarget(otherAgent, otherAgent),
    'user-questions/request',
    { questions: [question], agent: otherAgent },
    next,
  ),
  downstreamAnswer,
  'disposing the listener must restore waterfall fallthrough',
)

await waterfallCtx.fiber.dispose()

console.log('verify-question-routing: all assertions passed')
