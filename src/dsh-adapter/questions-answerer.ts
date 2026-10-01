/** Scope-aware question routing. Registration belongs to the TUI fiber. */
import type { Context } from '@deepseek-ai/cordis'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'

export interface QuestionAnswerer {
  ask(request: AskUserQuestionRequest, options?: { redact?: boolean }): Promise<AskUserQuestionAnswer>
}

/** Read the mutable channel identity for every request, including after resume. */
export function registerQuestionAnswerer(
  ctx: Context,
  owner: { readonly agentId: string },
  answerer: QuestionAnswerer,
): () => void {
  return ctx.on('user-questions/request', (request, next) => {
    if (request.agent !== undefined && String(request.agent.id) !== owner.agentId) return next()
    return answerer.ask(request, { redact: request.questions.some(question => question.id === 'dsh-auth-secret') })
  })
}
