import { ipcMain, app, session } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { join, delimiter } from 'path'
import type { BrowserWindow } from 'electron'

const isDev = !app.isPackaged

function getModelsBasePath(): string {
  return isDev
    ? join(process.cwd(), 'models')
    : join(app.getPath('userData'), 'models')
}

function getModelDir(lang: string): string {
  return join(getModelsBasePath(), lang)
}

interface OnnxFiles {
  encoder?: string
  decoder?: string
  joiner?: string
  ctcModel?: string
}

function findOnnxFiles(dir: string): OnnxFiles {
  let files: string[] = []
  try { files = readdirSync(dir).filter(f => f.endsWith('.onnx')) } catch { return {} }
  return {
    encoder:  files.find(f => f.startsWith('encoder')),
    decoder:  files.find(f => f.startsWith('decoder')),
    joiner:   files.find(f => f.startsWith('joiner')),
    ctcModel: files.find(f => !f.startsWith('encoder') && !f.startsWith('decoder') && !f.startsWith('joiner')),
  }
}

export interface ModelCheckResult {
  available: boolean
  modelPath: string
  missingFiles?: string[]
}

function checkModel(lang: string): ModelCheckResult {
  const dir = getModelDir(lang)
  if (!existsSync(dir)) {
    return { available: false, modelPath: dir, missingFiles: ['model directory not found'] }
  }
  if (!existsSync(join(dir, 'tokens.txt'))) {
    return { available: false, modelPath: dir, missingFiles: ['tokens.txt'] }
  }
  const { encoder, decoder, joiner, ctcModel } = findOnnxFiles(dir)
  if ((encoder && decoder && joiner) || ctcModel) return { available: true, modelPath: dir }
  const missing: string[] = []
  if (!encoder) missing.push('encoder-*.onnx')
  if (!decoder) missing.push('decoder-*.onnx')
  if (!joiner) missing.push('joiner-*.onnx')
  return { available: false, modelPath: dir, missingFiles: missing }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Recognizer = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stream = any

let dllPathInjected = false

function ensureDllPath(): void {
  if (dllPathInjected || process.platform !== 'win32') return
  dllPathInjected = true
  const dllDir = isDev
    ? join(process.cwd(), 'node_modules', 'sherpa-onnx-win-x64')
    : join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sherpa-onnx-win-x64')
  process.env.PATH = `${dllDir}${delimiter}${process.env.PATH ?? ''}`
}

function buildRecognizer(lang: string): Recognizer | null {
  const dir = getModelDir(lang)
  if (!existsSync(dir)) return null

  const { encoder, decoder, joiner, ctcModel } = findOnnxFiles(dir)
  const tokensPath = join(dir, 'tokens.txt')
  if (!existsSync(tokensPath)) return null

  ensureDllPath()

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OnlineRecognizer } = require('sherpa-onnx-node') as { OnlineRecognizer: new (c: unknown) => Recognizer }

  const base = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      tokens: tokensPath,
      numThreads: 2,
      debug: false,
      provider: 'cpu',
    },
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 300,
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
  }

  if (encoder && decoder && joiner) {
    return new OnlineRecognizer({
      ...base,
      modelConfig: {
        ...base.modelConfig,
        transducer: {
          encoder: join(dir, encoder),
          decoder: join(dir, decoder),
          joiner: join(dir, joiner),
        },
      },
    })
  }

  if (ctcModel) {
    return new OnlineRecognizer({
      ...base,
      modelConfig: {
        ...base.modelConfig,
        zipformer2Ctc: { model: join(dir, ctcModel) },
      },
    })
  }

  return null
}

let recognizer: Recognizer | null = null
let stream: Stream | null = null
let running = false
let getWin: (() => BrowserWindow | null) | null = null

function sendToRenderer(channel: string, payload: unknown): void {
  const win = getWin?.()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function setupSpeechEngine(getMainWindow: () => BrowserWindow | null): void {
  getWin = getMainWindow

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })

  ipcMain.handle('speech:check', (_e, lang: string) => checkModel(lang))

  ipcMain.handle('speech:getModelsBasePath', () => getModelsBasePath())

  ipcMain.handle('speech:start', (_e, lang: string) => {
    running = false
    stream = null
    recognizer = null
    try {
      const rec = buildRecognizer(lang)
      if (!rec) {
        const { modelPath, missingFiles } = checkModel(lang)
        const detail = missingFiles ? ` (missing: ${missingFiles.join(', ')})` : ''
        return { ok: false, error: `Model not found${detail}. Place model files in:\n${modelPath}` }
      }
      recognizer = rec
      stream = rec.createStream()
      running = true
      return { ok: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Recognizer init failed: ${msg}` }
    }
  })

  ipcMain.on('speech:audio', (_e, samples: Float32Array) => {
    if (!running || !recognizer || !stream) return
    try {
      stream.acceptWaveform({ samples, sampleRate: 16000 })
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream)
      }
      const partial = recognizer.getResult(stream) as { text: string; segment: number }
      if (partial.text) {
        sendToRenderer('speech:result', { text: partial.text, isFinal: false, segment: partial.segment ?? 0 })
      }
      if (recognizer.isEndpoint(stream)) {
        const final = recognizer.getResult(stream) as { text: string; segment: number }
        if (final.text) {
          sendToRenderer('speech:result', { text: final.text, isFinal: true, segment: final.segment ?? 0 })
        }
        recognizer.reset(stream)
      }
    } catch (err: unknown) {
      sendToRenderer('speech:error', { message: err instanceof Error ? err.message : String(err) })
    }
  })

  ipcMain.handle('speech:stop', () => {
    running = false
    stream = null
    recognizer = null
  })
}
