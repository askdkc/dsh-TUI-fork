/** Foreground shell requests retain the host-resolved execution policy. */
export interface ShellRequest {
  command: string
  workdir?: string
  timeoutMs: number
}

export interface ShellResult {
  stdout: { text: string }
  stderr: { text: string }
  timedOut: boolean
}

export interface ForegroundShell {
  resolve(request: ShellRequest): unknown
  execute(spec: unknown): Promise<{ result(): Promise<ShellResult> }>
}

/** Resolve through the host so workspace, timeout and sandbox policy survive. */
export async function runForegroundShell(shell: ForegroundShell, request: ShellRequest): Promise<ShellResult> {
  const spec = shell.resolve(request)
  const execution = await shell.execute(spec)
  return execution.result()
}
