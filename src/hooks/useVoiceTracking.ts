import { useState, useEffect, useRef, useCallback } from 'react'

export type VoiceStatus = 'unsupported' | 'idle' | 'listening' | 'denied' | 'error'

export interface VoiceTrackingResult {
  status: VoiceStatus
  transcript: string
  targetRatio: number | null
  language: string
  setLanguage: (lang: string) => void
  start: () => void
  stop: () => void
  errorMessage: string | null
}

export const VOICE_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'ar-MA', label: 'Arabic (Morocco)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'ar-EG', label: 'Arabic (Egypt)' },
]

declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition
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
  const SpeechRec =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null)
      : null
  const isSupported = SpeechRec !== null

  const [status, setStatus] = useState<VoiceStatus>(isSupported ? 'idle' : 'unsupported')
  const [transcript, setTranscript] = useState('')
  const [targetRatio, setTargetRatio] = useState<number | null>(null)
  const [language, setLanguage] = useState('en-US')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const recRef = useRef<SpeechRecognition | null>(null)
  const activeRef = useRef(false)
  const langRef = useRef(language)
  const scriptWordsRef = useRef<string[]>([])
  const createAndStartRef = useRef<(() => void) | null>(null)

  langRef.current = language

  useEffect(() => {
    scriptWordsRef.current = normalizeWords(script)
  }, [script])

  const createAndStart = useCallback(() => {
    if (!SpeechRec || !activeRef.current) return

    const rec = new SpeechRec()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langRef.current
    rec.maxAlternatives = 1
    recRef.current = rec

    rec.onstart = () => {
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
      // Show only the last 15 words so the UI doesn't overflow
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
        // Browser auto-stops after silence; restart after a short delay
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
      if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) createAndStartRef.current?.()
        }, 500)
      }
    }
  }, [SpeechRec])

  createAndStartRef.current = createAndStart

  const start = useCallback(() => {
    if (!isSupported || activeRef.current) return
    activeRef.current = true
    setTranscript('')
    setTargetRatio(null)
    setErrorMessage(null)
    createAndStart()
  }, [isSupported, createAndStart])

  const stop = useCallback(() => {
    activeRef.current = false
    try { recRef.current?.stop() } catch { /* ignore */ }
    recRef.current = null
    setStatus('idle')
    setTranscript('')
    setTargetRatio(null)
    setErrorMessage(null)
  }, [])

  // Restart recognition when language changes while listening
  useEffect(() => {
    if (activeRef.current && recRef.current) {
      try { recRef.current.stop() } catch { /* onend restarts with new langRef */ }
    }
  }, [language])

  useEffect(() => {
    return () => {
      activeRef.current = false
      try { recRef.current?.abort() } catch { /* ignore */ }
    }
  }, [])

  return { status, transcript, targetRatio, language, setLanguage, start, stop, errorMessage }
}
