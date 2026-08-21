import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(fileURLToPath(import.meta.url))
const scope = readScope(process.argv.slice(2))
const stages = createStages(repositoryRoot).filter((stage) => scope === 'all' || stage.id === scope)
const failures = []

for (const stage of stages) {
  process.stdout.write(`\n[verify-base] ${stage.label}\n`)
  const exitCode = await run(stage)
  if (exitCode !== 0) {
    failures.push(`${stage.id} (${exitCode})`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`\n[verify-base] failed: ${failures.join(', ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\n[verify-base] passed: ${stages.map((stage) => stage.id).join(', ')}\n`)
}

function readScope(args) {
  if (args.length > 1 || (args[0] && !['all', 'server', 'client'].includes(args[0]))) {
    process.stderr.write('Usage: node verify-base.mjs [all|server|client]\n')
    process.exit(2)
  }

  return args[0] ?? 'all'
}

function createStages(root) {
  const npmCommand = process.platform === 'win32'
    ? {
        command: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm.cmd run verify'],
      }
    : {
        command: 'npm',
        args: ['run', 'verify'],
      }

  return [
    {
      id: 'server',
      label: 'Go server tests',
      cwd: resolve(root, 'server'),
      command: 'go',
      args: ['test', './...'],
    },
    {
      id: 'client',
      label: 'Electron client verification',
      cwd: resolve(root, 'promedia-client'),
      ...npmCommand,
    },
  ]
}

function run(stage) {
  return new Promise((resolveExitCode) => {
    const child = spawn(stage.command, stage.args, {
      cwd: stage.cwd,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    })

    child.once('error', (error) => {
      process.stderr.write(`[verify-base] ${stage.id} could not start: ${error.message}\n`)
      resolveExitCode(1)
    })

    child.once('exit', (code, signal) => {
      if (signal) {
        process.stderr.write(`[verify-base] ${stage.id} stopped by signal ${signal}\n`)
        resolveExitCode(1)
        return
      }

      resolveExitCode(code ?? 1)
    })
  })
}
