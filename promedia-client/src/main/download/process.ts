import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export interface ProcessResult {
  code: number
  stdout: string
  stderr: string
  aborted: boolean
}

export function runProcess(
  command: string,
  args: readonly string[],
  signal: AbortSignal,
  maximumOutputBytes: number,
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      })
    } catch (error) {
      reject(error)
      return
    }

    let stdout = ''
    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let outputBytes = 0
    let aborted = signal.aborted
    let settled = false

    const finish = (result: ProcessResult): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      resolve(result)
    }
    const cancel = (): void => {
      aborted = true
      killProcessTree(child)
    }
    const consume = (chunk: Buffer, stream: 'stdout' | 'stderr'): void => {
      outputBytes += chunk.length
      if (outputBytes > maximumOutputBytes) {
        killProcessTree(child)
        return
      }
      const text = chunk.toString('utf8')
      if (stream === 'stdout') stdout += text
      else stderr += text
      const buffer = stream === 'stdout' ? stdoutBuffer + text : stderrBuffer + text
      const lines = buffer.split(/\r?\n/)
      const remainder = lines.pop() ?? ''
      if (stream === 'stdout') stdoutBuffer = remainder
      else stderrBuffer = remainder
      for (const line of lines) onLine?.(line, stream)
    }

    child.stdout.on('data', (chunk: Buffer) => consume(chunk, 'stdout'))
    child.stderr.on('data', (chunk: Buffer) => consume(chunk, 'stderr'))
    child.once('error', (error: Error) => {
      if (aborted) finish({ code: -1, stdout, stderr, aborted: true })
      else reject(error)
    })
    child.once('close', (code: number | null) => {
      if (stdoutBuffer) onLine?.(stdoutBuffer, 'stdout')
      if (stderrBuffer) onLine?.(stderrBuffer, 'stderr')
      finish({ code: code ?? -1, stdout, stderr, aborted })
    })
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  })
}

function killProcessTree(child: ChildProcessWithoutNullStreams): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    })
    const releaseChildHandle = (): void => {
      child.kill()
    }
    killer.once('error', releaseChildHandle)
    killer.once('close', releaseChildHandle)
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill()
  }
}
