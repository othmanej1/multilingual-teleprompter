import { memo } from 'react'
import './OperatorDashboard.css'

interface Props {
  isPlaying: boolean
  scrollRatio: number       // 0–1
  totalWords: number
  speed: number
  outputConnected: boolean
  cueCount: number
  popupBlocked: boolean
  onPlayPause: () => void
  onJump: (secs: number) => void
  onSpeedChange: (v: number) => void
  onOpenOutput: () => void
  onDismissPopupBlocked: () => void
  onJumpToCue: (dir: 'prev' | 'next') => void
}

function wordsRemaining(ratio: number, total: number) {
  return Math.max(0, Math.round(total * (1 - ratio)))
}

function timeRemaining(wordsLeft: number, speed: number) {
  if (speed <= 0 || wordsLeft === 0) return '—'
  // crude: assume ~2 lines/word average at typical fontSize, speed is px/s
  // We use word count / 130 wpm as base and scale by speed ratio (60 = nominal)
  const nominalWpm = 130
  const scaledWpm = nominalWpm * (speed / 60)
  const mins = wordsLeft / scaledWpm
  if (mins < 1) return `${Math.round(mins * 60)}s`
  return `${Math.floor(mins)}m ${Math.round((mins % 1) * 60)}s`
}

export const OperatorDashboard = memo(function OperatorDashboard({
  isPlaying, scrollRatio, totalWords, speed,
  outputConnected, cueCount, popupBlocked,
  onPlayPause, onJump, onSpeedChange, onOpenOutput, onDismissPopupBlocked, onJumpToCue,
}: Props) {
  const pct = Math.round(scrollRatio * 100)
  const wordsLeft = wordsRemaining(scrollRatio, totalWords)
  const timeLeft = timeRemaining(wordsLeft, speed)

  return (
    <div className="op-dashboard">
      <div className="op-header">
        <span className="op-title">Operator Dashboard</span>
        <button
          className={`op-output-btn${outputConnected ? ' connected' : ''}`}
          onClick={onOpenOutput}
          title={outputConnected ? 'Output window connected' : 'Open output window'}
        >
          <span className="op-output-dot" />
          {outputConnected ? 'Output: Live' : 'Open Output'}
        </button>
      </div>

      {/* Popup blocked notice */}
      {popupBlocked && (
        <div className="op-popup-blocked" role="alert">
          <span>Popup blocked — allow popups for this site to open the output window.</span>
          <button className="op-popup-dismiss" onClick={onDismissPopupBlocked} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Web browser note: second-monitor tip */}
      {!outputConnected && !window.electronAPI && (
        <p className="op-web-note">Tip: use the desktop app to send the output to a second monitor.</p>
      )}

      {/* Progress bar */}
      <div className="op-progress-wrap" title={`${pct}% complete`}>
        <div className="op-progress-bar" style={{ width: `${pct}%` }} />
        <span className="op-progress-label">{pct}%</span>
      </div>

      {/* Stats row */}
      <div className="op-stats">
        <div className="op-stat">
          <span className="op-stat-val">{wordsLeft.toLocaleString()}</span>
          <span className="op-stat-label">words left</span>
        </div>
        <div className="op-stat">
          <span className="op-stat-val">{timeLeft}</span>
          <span className="op-stat-label">remaining</span>
        </div>
        <div className="op-stat">
          <span className="op-stat-val">{speed}</span>
          <span className="op-stat-label">px/s</span>
        </div>
      </div>

      {/* Transport controls */}
      <div className="op-transport">
        <button className="op-jump" onClick={() => onJump(-10)} title="Back 10s" aria-label="Jump back 10 seconds">«10</button>
        <button className="op-jump" onClick={() => onJump(-5)} title="Back 5s" aria-label="Jump back 5 seconds">«5</button>
        <button
          className={`op-play${isPlaying ? ' playing' : ''}`}
          onClick={onPlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="op-jump" onClick={() => onJump(5)} title="Forward 5s" aria-label="Jump forward 5 seconds">5»</button>
        <button className="op-jump" onClick={() => onJump(10)} title="Forward 10s" aria-label="Jump forward 10 seconds">10»</button>
      </div>

      {/* Cue navigation — only shown when script contains [CUE] markers */}
      {cueCount > 0 && (
        <div className="op-cue-row">
          <span className="op-cue-label">Cues · {cueCount}</span>
          <div className="op-cue-btns">
            <button className="op-jump" onClick={() => onJumpToCue('prev')} title="Previous cue  [" aria-label="Jump to previous cue">◀ Prev</button>
            <button className="op-jump" onClick={() => onJumpToCue('next')} title="Next cue  ]" aria-label="Jump to next cue">Next ▶</button>
          </div>
        </div>
      )}

      {/* Speed slider */}
      <div className="op-speed-row">
        <span className="op-speed-label" id="op-speed-label">Speed</span>
        <input
          type="range" min={10} max={300} value={speed}
          onChange={e => onSpeedChange(+e.target.value)}
          className="op-speed-slider"
          aria-labelledby="op-speed-label"
        />
        <span className="op-speed-val">{speed}</span>
      </div>
    </div>
  )
})
