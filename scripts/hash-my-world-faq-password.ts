import { argon2id, hash } from 'argon2'

const MAX_BYTES = 256
const MIN_CHARACTERS = 20

async function main() {
  if (process.argv.length > 2) {
    throw new Error('Do not pass the password as a command argument.')
  }

  const password = process.stdin.isTTY
    ? await readConfirmedHiddenPassword()
    : (await readAllStdin()).replace(/\r?\n$/, '')
  if ([...password].length < MIN_CHARACTERS || Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    throw new Error('Use a password-manager-generated secret between 20 characters and 256 bytes.')
  }

  const encoded = await hash(password, {
    type: argon2id,
    memoryCost: 19 * 1_024,
    timeCost: 2,
    parallelism: 1,
  })
  process.stdout.write(`${encoded}\n`)
}

async function readConfirmedHiddenPassword(): Promise<string> {
  const first = await readHiddenLine('Shared editor password: ')
  const second = await readHiddenLine('Confirm password: ')
  if (first !== second) throw new Error('The two passwords did not match.')
  return first
}

async function readHiddenLine(prompt: string): Promise<string> {
  process.stderr.write(prompt)
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  let value = ''

  return new Promise((resolve, reject) => {
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup()
          reject(new Error('Cancelled.'))
          return
        }
        if (character === '\r' || character === '\n') {
          cleanup()
          process.stderr.write('\n')
          resolve(value)
          return
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
          continue
        }
        value += character
      }
    }
    const cleanup = () => {
      process.stdin.off('data', onData)
      process.stdin.setRawMode?.(false)
      process.stdin.pause()
    }
    process.stdin.on('data', onData)
  })
}

async function readAllStdin(): Promise<string> {
  process.stdin.setEncoding('utf8')
  let value = ''
  for await (const chunk of process.stdin) value += chunk
  return value
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Could not hash the password.'}\n`,
  )
  process.exitCode = 1
})
