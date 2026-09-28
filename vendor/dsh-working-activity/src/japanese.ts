/** Japanese progress copy. Tool names and user-supplied details stay verbatim. */
export const THINKING: readonly string[] = ['考えています', '確認しています', '手順を整理しています']
export const THINKING_TIERS: readonly { atMs: number; pool: readonly string[] }[] = [
  { atMs: 300_000, pool: ['時間をかけて確認しています'] },
  { atMs: 60_000, pool: ['引き続き調べています'] },
  { atMs: 30_000, pool: ['もう少し確認しています'] },
]
export const WAITING: readonly string[] = ['モデルの応答を待っています']
export const NIGHT: readonly string[] = ['作業を続けています']
export const RARE: readonly string[] = ['確認を進めています']
export const WEEKEND: readonly string[] = ['作業を進めています']
export const RETRY: readonly string[] = ['再試行を待っています']
export const APPROVAL: readonly string[] = ['承認を待っています']
export const COMPACTION_START: readonly string[] = ['会話を整理しています']
export const CONTINUE: readonly string[] = ['作業を再開します']
export const COMPACT: readonly string[] = ['会話を整理しました']
export const OVERFLOW: readonly string[] = ['会話の整理を試みています']
export const COMPACT_RETRY: readonly string[] = ['会話を整理し直しています']
export const TOOL_OPENING: readonly string[] = ['ツールを使って確認します']
export const FAIL: readonly string[] = ['ツールの実行に失敗しました']
export const DONE: readonly string[] = ['完了しました']
export const NEW_YEAR: readonly string[] = ['作業を進めています']
export const HOLIDAYS: Readonly<Record<string, readonly string[]>> = {}
export const MODEL_QUIPS: Readonly<Record<string, readonly string[]>> = {
  claude: ['Claude に切り替えました'],
  gpt: ['GPT に切り替えました'],
  grok: ['Grok に切り替えました'],
  gemini: ['Gemini に切り替えました'],
  deepseek: ['DeepSeek に切り替えました'],
  haiku: ['Haiku に切り替えました'],
  sonnet: ['Sonnet に切り替えました'],
  opus: ['Opus に切り替えました'],
  flash: ['Flash に切り替えました'],
  pro: ['Pro に切り替えました'],
  mini: ['Mini に切り替えました'],
}
export const ACTION_MAP: readonly { test: RegExp; actions: readonly string[] }[] = [
  { test: /^(read|read_file|cat)$/i, actions: ['読み取り'] },
  { test: /^(write|write_file|create_file)$/i, actions: ['書き込み'] },
  { test: /^(edit|edit_file|str_replace|apply_patch|search_replace)$/i, actions: ['編集'] },
  { test: /^(bash|shell|run|exec|powershell|cmd)$/i, actions: ['コマンド実行'] },
  { test: /^(grep|rg|search|search_in_files|ffgrep)$/i, actions: ['検索'] },
  { test: /^(find|glob|fffind)$/i, actions: ['ファイル検索'] },
  { test: /^(subagent|agent|task)$/i, actions: ['サブエージェント実行'] },
  { test: /^(web_search|browse|fetch)$/i, actions: ['Web 検索'] },
]
export const FALLBACK_ACTIONS: readonly string[] = ['ツール実行']
