import { memo } from 'react'
import './VoiceTracker.css'
import type { VoiceStatus } from '../hooks/useVoiceTracking'
import { VOICE_LANGUAGES } from '../hooks/useVoiceTracking'

interface Props {
  status: VoiceStatus
  transcript: string
  targetRatio: number | null
  scrollRatio: number
  language: string
  errorMessage: string | null
  onStart: () => void
  onStop: () => void
  onLanguageChange: (lang: string) => void
}

const STATUS_LABEL: Record<VoiceStatus, string> = {
  unsupported: 'Not Supported',
  idle: 'Ready',
  listening: 'Listening',
  denied: 'Permission Denied',
  error: 'Error',
}

const STATUS_COLOR: Record<VoiceStatus, string> = {
  unsupported: '#3e4158',
  idle: '#4e5168',
  listening: '#4ade80',
  denied: '#ef4444',
  error: '#f59e0b',
}

export const VoiceTracker = memo(function VoiceTracker({
  status, transcript, targetRatio, scrollRatio, language, errorMessage,
  onStart, onStop, onLanguageChange,
}: Props) {
  const isListening = status === 'listening'
  const isUnsupported = status === 'unsupported'

  const voicePct = targetRatio !== null ? Math.round(targetRatio * 100) : null
  const scrollPct = Math.round(scrollRatio * 100)
  const drift = voicePct !== null ? voicePct - scrollPct : null

  return (
    <div className="vt-panel">
      <div className="vt-header">
        <span className="vt-title">Voice Tracking</span>
        <span
          className={`vt-status-dot${isListening ? ' listening' : ''}`}
          style={{ background: STATUS_COLOR[status] }}
        />
        <span className="vt-status-text">{STATUS_LABEL[status]}</span>
      </div>

      <div className="vt-row">
        <span className="vt-label">Language</span>
        <select
          className="sel vt-lang-sel"
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          disabled={isUnsupported}
        >
          {VOICE_LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="vt-row">
        {isListening ? (
          <button className="vt-btn vt-stop" onClick={onStop}>⬛ Stop</button>
        ) : (
          <button
            className="vt-btn vt-start"
            onClick={onStart}
            disabled={isUnsupported}
            title={isUnsupported ? 'Web Speech API not supported — use Chrome or Edge' : 'Start voice tracking'}
          >
            🎙 Start Listening
          </button>
        )}
      </div>

      {transcript && (
        <div className="vt-transcript-box">
          <span className="vt-transcript-label">Heard</span>
          <p className="vt-transcript-text">{transcript}</p>
        </div>
      )}

      {voicePct !== null && (
        <div className="vt-position-row">
          <div className="vt-pos-item">
            <span className="vt-pos-label">Voice pos</span>
            <span className="vt-pos-val">{voicePct}%</span>
          </div>
          <div className="vt-pos-item">
            <span className="vt-pos-label">Scroll pos</span>
            <span className="vt-pos-val">{scrollPct}%</span>
          </div>
          {drift !== null && (
            <div className="vt-pos-item">
              <span className="vt-pos-label">Drift</span>
              <span className={`vt-pos-val vt-drift${Math.abs(drift) > 5 ? (drift > 0 ? ' ahead' : ' behind') : ''}`}>
                {drift > 0 ? `+${drift}%` : drift < 0 ? `${drift}%` : '—'}
              </span>
            </div>
          )}
        </div>
      )}

      {(errorMessage || status === 'denied') && (
        <div className="vt-error">{errorMessage ?? 'Microphone access denied'}</div>
      )}

      {isUnsupported && (
        <div className="vt-warn">
          Web Speech API requires Chrome or Edge. Firefox and Safari do not support it.
        </div>
      )}
    </div>
  )
})
