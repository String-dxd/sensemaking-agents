import { bootstrapMyWorldFaq } from '../src/server/my-world-faq-repository.server'

async function main() {
  const result = await bootstrapMyWorldFaq()
  process.stdout.write(
    `${result.created ? 'Created' : 'Verified'} My World FAQ revision ${result.revision.version} (${result.revision.digest}).\n`,
  )
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN'
  process.stderr.write(`My World FAQ bootstrap stopped (${code}). No content was changed.\n`)
  process.exitCode = 1
})
