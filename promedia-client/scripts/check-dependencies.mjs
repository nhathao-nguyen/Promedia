import { readFile } from 'node:fs/promises'

const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const policy = JSON.parse(await readFile(new URL('../dependency-policy.json', import.meta.url), 'utf8'))
const allowed = new Map(Object.entries(policy.allowedDeprecatedTransitive))
const deprecated = new Map()
const currentDate = localDate(new Date())

for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
  if (!metadata.deprecated) continue
  deprecated.set(packagePath, metadata)
}

const errors = []
for (const [packagePath, metadata] of deprecated) {
  const exception = allowed.get(packagePath)
  if (!exception) {
    errors.push(`${packagePath}@${metadata.version} is deprecated and has no reviewed exception`)
    continue
  }
  if (exception.version !== metadata.version) {
    errors.push(`${packagePath} changed from reviewed ${exception.version} to ${metadata.version}`)
  }
  if (packagePath === `node_modules/${packageName(packagePath)}` && isDirectDependency(packageName(packagePath))) {
    errors.push(`${packagePath} is a deprecated direct dependency and cannot be excepted`)
  }
  if (typeof exception.reviewAfter !== 'string' || exception.reviewAfter < currentDate) {
    errors.push(`${packagePath} exception review expired on ${exception.reviewAfter ?? 'an invalid date'}`)
  }
}

for (const packagePath of allowed.keys()) {
  if (!deprecated.has(packagePath)) {
    errors.push(`${packagePath} is no longer deprecated; remove its stale exception`)
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`[dependency-policy] ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`[dependency-policy] ${deprecated.size} reviewed transitive deprecations; no unreviewed entries\n`)
}

function isDirectDependency(name) {
  const root = lockfile.packages?.[''] ?? {}
  return name in (root.dependencies ?? {}) || name in (root.devDependencies ?? {})
}

function packageName(packagePath) {
  const suffix = packagePath.split('node_modules/').at(-1)
  if (!suffix.startsWith('@')) return suffix.split('/')[0]
  return suffix.split('/').slice(0, 2).join('/')
}

function localDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
