import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Current tool messages carry output and error state directly. */
export function toolResultPayload(message: {
  readonly content?: readonly ContentBlock[]
  readonly isError?: boolean
} | undefined): { content: readonly ContentBlock[]; isError: boolean } {
  return { content: message?.content ?? [], isError: message?.isError === true }
}

export function isCompactionCheckpointSource(source: { kind: string }): boolean {
  return source.kind === 'compact-checkpoint'
}
