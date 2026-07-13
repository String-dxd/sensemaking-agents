import fs from 'node:fs/promises'
import path from 'node:path'

const port = Number(process.env.CHROME_DEBUG_PORT ?? 9223)
const species = process.argv[2] ?? 'Eagle'
const outputDir = path.resolve(process.argv[3] ?? 'artifacts/wing-review')
const pose = process.argv[4] ?? 'neutral'
const appUrl = process.argv[5] ?? process.env.CHARACTER_STUDIO_URL ?? 'http://127.0.0.1:5190'

const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
const target = pages.find((page) => page.type === 'page' && page.url.startsWith(appUrl))
if (!target) throw new Error('Character Studio browser target not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
const consoleErrors = []
let sequence = 0

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(message.params.exceptionDetails.text)
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
  }
})

function cdp(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function clickButton(label, delay = 800) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button);
  })()`)
  if (!clicked) throw new Error(`Button not found: ${label}`)
  await wait(delay)
}

async function clickButtonContaining(fragment, excludedLabel) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) => {
      const label = node.textContent?.trim() ?? '';
      return label.includes(${JSON.stringify(fragment)}) && label !== ${JSON.stringify(excludedLabel)};
    });
    button?.click();
    return Boolean(button);
  })()`)
  if (!clicked) throw new Error(`Button containing text not found: ${fragment}`)
  await wait(800)
}

async function canvasRect() {
  return evaluate(`(() => {
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  })()`)
}

async function waitForCanvasLayout() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const rect = await canvasRect()
    if (rect?.width >= 600 && rect.height >= 500) return
    await wait(250)
  }
  throw new Error('Canvas layout did not reach the review viewport')
}

async function orbit(deltaX) {
  const rect = await canvasRect()
  if (!rect) throw new Error('Canvas not found')
  const x = rect.x + rect.width * 0.5
  const y = rect.y + rect.height * 0.5
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + deltaX, y, button: 'left', buttons: 1 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + deltaX, y, button: 'left', clickCount: 1 })
  await wait(700)
}

async function screenshot(name) {
  const rect = await canvasRect()
  if (!rect) throw new Error('Canvas not found')
  const capture = await cdp('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...rect, scale: 1 },
  })
  const poseSuffix = pose === 'neutral' ? '' : `-${pose}`
  const file = path.join(outputDir, `${species.toLowerCase()}${poseSuffix}-${name}.png`)
  await fs.writeFile(file, Buffer.from(capture.data, 'base64'))
  return file
}

await fs.mkdir(outputDir, { recursive: true })
await cdp('Page.enable')
await cdp('Runtime.enable')
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})
await cdp('Page.reload', { ignoreCache: true })
await wait(300)
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})
await evaluate(`(() => { window.dispatchEvent(new Event('resize')); return true; })()`)
await wait(2500)
await clickButton('Bird')
await clickButton(species)
await wait(2000)
await waitForCanvasLayout()

if (pose === 'wave') {
  await clickButton('7Play')
  const gesturesVisible = await evaluate(`[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'wave')`)
  if (!gesturesVisible) {
    const entered = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((node) => {
        const label = node.textContent?.trim() ?? '';
        return label.includes('play') && !label.includes('exit') && label !== '7Play';
      });
      button?.click();
      return Boolean(button);
    })()`)
    if (!entered) throw new Error('Play toggle not found')
    await wait(800)
  }
  await wait(1600)
}

async function preparePose() {
  if (pose !== 'wave') return
  await clickButton('wave', 0)
  await wait(550)
}

const files = []
await preparePose()
files.push(await screenshot('front'))
await orbit(-165)
await preparePose()
files.push(await screenshot('three-quarter'))
await orbit(-165)
await preparePose()
files.push(await screenshot('side'))

const report = {
  species,
  pose,
  files,
  canvas: await canvasRect(),
  consoleErrors,
  buttonLabels: await evaluate(`[...document.querySelectorAll('button')].map((button) => button.textContent?.trim()).filter(Boolean)`),
}
await fs.writeFile(path.join(outputDir, `${species.toLowerCase()}-${pose}-report.json`), `${JSON.stringify(report, null, 2)}\n`)
socket.close()
console.log(JSON.stringify(report, null, 2))
