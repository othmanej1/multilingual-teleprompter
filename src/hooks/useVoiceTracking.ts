import { useState, useEffect, useRef, useCallback } from 'react'

export type VoiceStatus = 'unsupported' | 'idle' | 'starting' | 'listening' | 'denied' | 'error'

export interface VoiceTrackingResult {
  status: VoiceStatus
  transcript: string
  targetRatio: number | null
  language: string
  setLanguage: (lang: string) => void
  start: () => void
  stop: () => void
  errorMessage: string | null
  engine: 'browser' | 'electron-offline'
  modelPath: string | null
}

export const VOICE_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'ar-MA', label: 'Arabic (Morocco)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'ar-EG', label: 'Arabic (Egypt)' },
]

// Web Speech API — not universally present in TypeScript DOM lib versions
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null
  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null
  abort(): void
  start(): void
  stop(): void
}

declare global {
  interface Window {
    SpeechRecognition: (new () => SpeechRecognition) | undefined
    webkitSpeechRecognition: (new () => SpeechRecognition) | undefined
  }
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
}

// Sliding-window match: find where `recentWords` best aligns within `scriptWords`.
// Returns a 0–1 ratio of position in script, or null when confidence is too low.
function estimatePosition(scriptWords: string[], recentWords: string[]): number | null {
  if (scriptWords.length === 0 || recentWords.length === 0) return null
  const windowSize = Math.min(6, recentWords.length)
  if (windowSize < 2) return null
  const win = recentWords.slice(-windowSize)

  let bestScore = 0
  let bestEndPos = 0

  for (let i = 0; i <= scriptWords.length - windowSize; i++) {
    let score = 0
    for (let j = 0; j < windowSize; j++) {
      if (scriptWords[i + j] === win[j]) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestEndPos = i + windowSize
    }
  }

  if (bestScore < Math.max(2, windowSize * 0.6)) return null
  return bestEndPos / scriptWords.length
}

export function useVoiceTracking(script: string): VoiceTrackingResult {
  // Determine engine type once — stable for the lifetime of the component
  const isElectron = typeof window !== 'undefined' && !!(window as Window).electronAPI?.speech

  const SpeechRec =
    !isElectron && typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null)
      : null
  const isSupported = isElectron || SpeechRec !== null

  const [status, setStatus] = useState<VoiceStatus>(isSupported ? 'idle' : 'unsupported')
  const [transcript, setTranscript] = useState('')
  const [targetRatio, setTargetRatio] = useState<number | null>(null)
  const [language, setLanguage] = useState('en-US')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [modelPath, setModelPath] = useState<string | null>(null)

  // ── Shared refs ─────────────────────────────────────────────
  const activeRef = useRef(false)
  const langRef = useRef(language)
  const scriptWordsRef = useRef<string[]>([])

  useEffect(() => {
    langRef.current = language
  }, [language])

  useEffect(() => {
    scriptWordsRef.current = normalizeWords(script)
  }, [script])

  // ── Web Speech refs ──────────────────────────────────────────
  const recRef = useRef<SpeechRecognition | null>(null)
  const isListeningRef = useRef(false)
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const createAndStartRef = useRef<((isInitial?: boolean) => void) | null>(null)

  // ── Electron offline refs ────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const elCompletedTextsRef = useRef<string[]>([])
  const elPartialRef = useRef<string>('')

  // ── Web Speech implementation ────────────────────────────────
  const createAndStart = useCallback((isInitial = false) => {
    if (!SpeechRec || !activeRef.current) return

    if (isInitial) {
      isListeningRef.current = false
      clearTimeout(startTimeoutRef.current)
      startTimeoutRef.current = setTimeout(() => {
        if (activeRef.current && !isListeningRef.current) {
          activeRef.current = false
          setStatus('error')
          setErrorMessage('Microphone did not respond. Check browser permissions.')
          try { recRef.current?.abort() } catch { /* ignore */ }
          recRef.current = null
        }
      }, 5000)
    }

    const rec = new SpeechRec()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langRef.current
    rec.maxAlternatives = 1
    recRef.current = rec

    rec.onstart = () => {
      clearTimeout(startTimeoutRef.current)
      isListeningRef.current = true
      setStatus('listening')
      setErrorMessage(null)
    }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let accumulated = ''
      for (let i = 0; i < e.results.length; i++) {
        accumulated += e.results[i][0].transcript + ' '
      }
      const words = normalizeWords(accumulated)
      const recent = words.slice(-200)
      setTranscript(recent.slice(-15).join(' '))
      setTargetRatio(estimatePosition(scriptWordsRef.current, recent))
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        activeRef.current = false
        setStatus('denied')
        setErrorMessage('Microphone access denied. Allow it in browser settings.')
      } else if (e.error !== 'aborted') {
        setStatus('error')
        setErrorMessage(e.error)
      }
    }

    rec.onend = () => {
      if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) createAndStartRef.current?.()
        }, 300)
      } else {
        setStatus('idle')
        recRef.current = null
      }
    }

    try {
      rec.start()
    } catch {
      if (isInitial) {
        clearTimeout(startTimeoutRef.current)
        activeRef.current = false
        setStatus('error')
        setErrorMessage('Could not access microphone.')
      } else if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) createAndStartRef.current?.()
        }, 500)
      }
    }
  }, [SpeechRec])

  useEffect(() => {
    createAndStartRef.current = createAndStart
  }, [createAndStart])

  // ── Electron offline implementation ─────────────────────────
  const stopElectronAudio = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
  }, [])

  const startElectron = useCallback(() => {
    if (activeRef.current) return
    const eAPI = (window as Window).electronAPI!

    activeRef.current = true
    setStatus('starting')
    setTranscript('')
    setTargetRatio(null)
    setErrorMessage(null)
    elCompletedTextsRef.current = []
    elPartialRef.current = ''

    eAPI.speech.check(langRef.current)
      .then(check => {
        if (!activeRef.current) return undefined
        setModelPath(check.modelPath)
        if (!check.available) {
          activeRef.current = false
          setStatus('error')
          const missing = check.missingFiles ? ` (missing: ${check.missingFiles.join(', ')})` : ''
          setErrorMessage(`Speech model not found${missing}.\nPlace files in: ${check.modelPath}`)
          return undefined
        }
        return eAPI.speech.start(langRef.current)
      })
      .then(result => {
        if (!result || !activeRef.current) return undefined
        if (!result.ok) {
          activeRef.current = false
          setStatus('error')
          setErrorMessage(result.error ?? 'Recognizer failed to start')
          return undefined
        }
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      })
      .then(micStream => {
        if (!micStream || !activeRef.current) {
          micStream?.getTracks().forEach(t => t.stop())
          return
        }
        micStreamRef.current = micStream
        const ctx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(micStream)
        // bufferSize 4096 = 256ms at 16kHz; fires ~4x/sec
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (!activeRef.current) return
          eAPI.speech.sendAudio(new Float32Array(e.inputBuffer.getChannelData(0)))
        }
        source.connect(processor)
        processor.connect(ctx.destination)
        setStatus('listening')
      })
      .catch(err => {
        if (!activeRef.current) return
        activeRef.current = false
        stopElectronAudio()
        eAPI.speech.stop()
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setStatus('denied')
          setErrorMessage('Microphone access denied.')
        } else {
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Could not start voice recognition')
        }
      })
  }, [stopElectronAudio])

  const stopElectron = useCallback(() => {
    activeRef.current = false
    stopElectronAudio()
    ;(window as Window).electronAPI?.speech.stop()
    setStatus('idle')
    setTranscript('')
    setTargetRatio(null)
    setErrorMessage(null)
  }, [stopElectronAudio])

  // ── Result listener (Electron only, registered once on mount) ──
  useEffect(() => {
    if (!isElectron) return
    const eAPI = (window as Window).electronAPI!

    eAPI.speech.onResult(({ text, isFinal }) => {
      if (!activeRef.current) return
      if (isFinal) {
        if (text) elCompletedTextsRef.current.push(text)
        elPartialRef.current = ''
      } else {
        elPartialRef.current = text
      }
      const allText = [...elCompletedTextsRef.current, elPartialRef.current]
        .filter(Boolean).join(' ')
      const words = normalizeWords(allText).slice(-200)
      setTranscript(words.slice(-15).join(' '))
      setTargetRatio(estimatePosition(scriptWordsRef.current, words))
    })

    eAPI.speech.onError(({ message }) => {
      if (!activeRef.current) return
      setStatus('error')
      setErrorMessage(`Recognition error: ${message}`)
    })

    return () => {
      eAPI.speech.offResult()
      eAPI.speech.offError()
    }
  }, [isElectron])

  // ── Combined start / stop ────────────────────────────────────
  const start = useCallback(() => {
    if (isElectron) {
      startElectron()
    } else {
      if (!isSupported || activeRef.current) return
      activeRef.current = true
      setStatus('starting')
      setTranscript('')
      setTargetRatio(null)
      setErrorMessage(null)
      createAndStart(true)
    }
  }, [isElectron, isSupported, createAndStart, startElectron])

  const stop = useCallback(() => {
    if (isElectron) {
      stopElectron()
    } else {
      clearTimeout(startTimeoutRef.current)
      activeRef.current = false
      isListeningRef.current = false
      try { recRef.current?.stop() } catch { /* ignore */ }
      recRef.current = null
      setStatus('idle')
      setTranscript('')
      setTargetRatio(null)
      setErrorMessage(null)
    }
  }, [isElectron, stopElectron])

  // ── Language change: restart active recognition ──────────────
  useEffect(() => {
    if (!isElectron) {
      // Web Speech: calling stop() triggers onend which restarts with new langRef
      if (activeRef.current && recRef.current) {
        try { recRef.current.stop() } catch { /* onend handles restart */ }
      }
    } else {
      // Electron: swap recognizer without stopping mic
      if (!activeRef.current) return
      const eAPI = (window as Window).electronAPI!
      elCompletedTextsRef.current = []
      elPartialRef.current = ''
      eAPI.speech.stop().then(() => {
        if (!activeRef.current) return
        return eAPI.speech.start(langRef.current)
      }).then(result => {
        if (!result || !activeRef.current) return
        if (!result.ok) {
          activeRef.current = false
          setStatus('error')
          setErrorMessage(result.error ?? 'Failed to restart recognizer')
        }
      }).catch(() => { /* ignore */ })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  // ── Cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(startTimeoutRef.current)
      activeRef.current = false
      // Web Speech
      try { recRef.current?.abort() } catch { /* ignore */ }
      // Electron
      processorRef.current?.disconnect()
      audioCtxRef.current?.close().catch(() => {})
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      ;(window as Window).electronAPI?.speech.stop()
    }
  }, [])

  return {
    status,
    transcript,
    targetRatio,
    language,
    setLanguage,
    start,
    stop,
    errorMessage,
    engine: isElectron ? 'electron-offline' : 'browser',
    modelPath,
  }
}
