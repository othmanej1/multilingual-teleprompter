import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { ScriptLibrary } from './components/ScriptLibrary'
import { OperatorDashboard } from './components/OperatorDashboard'
import { VoiceTracker } from './components/VoiceTracker'
import { useSyncChannel } from './hooks/useSyncChannel'
import { useVoiceTracking } from './hooks/useVoiceTracking'
import { useSettings } from './contexts/SettingsContext'
import { FONT_FAMILY_OPTIONS, fontFamilyCss } from './lib/settings'
import { renderScript, countCues } from './lib/cues'
import {
  loadScripts, persistScripts, loadActiveId, persistActiveId, makeScript,
} from './lib/storage'
import type { Script, SaveStatus, SyncMessage } from './lib/types'

const SAMPLE = `Welcome to your professional teleprompter.

Paste your script here — it will appear in this preview panel on the right.

مرحباً بك في برنامج قراءة النصوص المحترف.
يمكنك لصق نصوصك هنا وستظهر بشكل صحيح في نافذة المعاينة.

Tips:
• Press Space to play / pause
• Adjust speed and font size with the sliders
• Enable Mirror mode for use with teleprompter glass
• Set direction to RTL for Arabic-only scripts, or leave on Auto for mixed content

Start scrolling when you're ready.`

function bootstrapScripts(): Script[] {
  const saved = loadScripts()
  if (saved.length > 0) return saved
  const first = makeScript('Welcome Script', SAMPLE)
  persistScripts([first])
  return [first]
}

function bootstrapActiveId(): string {
  const scripts = loadScripts()
  const saved = loadActiveId()
  return (saved && scripts.some(s => s.id === saved)) ? saved : (scripts[0]?.id ?? '')
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('en', opts)
}

// Workspace persistence keys
const LS_EDITOR_WIDTH     = 'tp_editor_width'
const LS_EDITOR_COLLAPSED = 'tp_editor_collapsed'
const LS_FOCUS_MODE       = 'tp_focus_mode'

const EDITOR_MIN_W = 280
const EDITOR_MAX_W = 720
const EDITOR_DEFAULT_W = 480

function loadEditorWidth(): number {
  const raw = localStorage.getItem(LS_EDITOR_WIDTH)
  if (!raw) return EDITOR_DEFAULT_W
  const n = parseInt(raw, 10)
  return isNaN(n) ? EDITOR_DEFAULT_W : Math.max(EDITOR_MIN_W, Math.min(EDITOR_MAX_W, n))
}

export default function App() {
  const { settings, update } = useSettings()

  // ── Script management ──────────────────────────────────
  const [scripts, setScripts] = useState<Script[]>(bootstrapScripts)
  const [activeId, setActiveId] = useState<string>(bootstrapActiveId)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [titleEditing, setTitleEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isInitialMount = useRef(true)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  // ── Playback ───────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)

  // ── Fullscreen / guide / countdown ────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [guideVisible, setGuideVisible] = useState(true)
  const [guideColor, setGuideColor] = useState('#ffffff')
  const [guideOpacity, setGuideOpacity] = useState(0.25)
  const [countdownOption, setCountdownOption] = useState(0)
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownValue, setCountdownValue] = useState(0)

  // ── Settings panel (collapsible row 3) ────────────────
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ── Side panels ────────────────────────────────────────
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [outputConnected, setOutputConnected] = useState(false)
  const [scrollRatio, setScrollRatio] = useState(0)

  // ── Workspace ergonomics — persisted ──────────────────
  const [editorWidth, setEditorWidth] = useState(loadEditorWidth)
  const [editorCollapsed, setEditorCollapsed] = useState(
    () => localStorage.getItem(LS_EDITOR_COLLAPSED) === 'true',
  )
  const [focusMode, setFocusMode] = useState(
    () => localStorage.getItem(LS_FOCUS_MODE) === 'true',
  )
  const [isDragging, setIsDragging] = useState(false)

  // ── Refs ───────────────────────────────────────────────
  const outputWindowRef  = useRef<Window | null>(null)
  const scrollRatioRef   = useRef(0)
  const dashboardTickRef = useRef(0)
  const sendSyncRef      = useRef<(msg: SyncMessage) => void>(() => {})

  const voiceTargetRatioRef = useRef<number | null>(null)
  const voiceEnabledRef     = useRef(false)
  const voiceGraceUntilRef  = useRef(0)
  const scriptRef           = useRef('')

  const appRef     = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const rafRef     = useRef<number>(0)
  const lastTimeRef = useRef<number | null>(null)

  // ── Derived ────────────────────────────────────────────
  const activeScript = scripts.find(s => s.id === activeId) ?? scripts[0]
  const script = activeScript?.content ?? ''
  scriptRef.current = script

  const filteredScripts = useMemo(
    () => searchQuery
      ? scripts.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : scripts,
    [scripts, searchQuery],
  )

  const stats = useMemo(() => {
    const trimmed = script.trim()
    if (!trimmed) return { words: 0, chars: 0, duration: '0s', totalSecs: 0 }
    const words = trimmed.split(/\s+/).length
    const chars = script.length
    const totalSecs = Math.round((words / 130) * 60)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return { words, chars, duration: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`, totalSecs }
  }, [script])

  const cueCount = useMemo(() => countCues(script), [script])

  // ── Voice tracking ─────────────────────────────────────
  const voice = useVoiceTracking(script)
  const voiceActive = voice.status === 'listening'
  voiceTargetRatioRef.current = voice.targetRatio
  voiceEnabledRef.current = voiceActive

  // ── Workspace persistence ──────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_EDITOR_WIDTH, String(editorWidth))
  }, [editorWidth])

  useEffect(() => {
    localStorage.setItem(LS_EDITOR_COLLAPSED, String(editorCollapsed))
  }, [editorCollapsed])

  useEffect(() => {
    localStorage.setItem(LS_FOCUS_MODE, String(focusMode))
  }, [focusMode])

  // ── BroadcastChannel ───────────────────────────────────
  const sendSync = useSyncChannel(useCallback((msg: SyncMessage) => {
    if (msg.type === 'pong') {
      setOutputConnected(true)
      sendSyncRef.current({ type: 'script', content: scriptRef.current })
    }
  }, []))

  useEffect(() => { sendSyncRef.current = sendSync }, [sendSync])

  useEffect(() => {
    if (!outputConnected) return
    sendSyncRef.current({ type: 'script', content: script })
  }, [script, outputConnected])

  useEffect(() => {
    if (!outputConnected) return
    const id = setInterval(() => sendSyncRef.current({ type: 'ping' }), 3000)
    return () => clearInterval(id)
  }, [outputConnected])

  // ── Output window ──────────────────────────────────────
  const openOutputWindow = useCallback(() => {
    if (outputWindowRef.current && !outputWindowRef.current.closed) {
      outputWindowRef.current.focus()
      return
    }
    // Strip any existing query/hash so the URL is always clean.
    // window.location.href works for both http:// (dev) and
    // file:// (Electron production) — origin alone is "null" for file://.
    const base = window.location.href.replace(/[?#].*$/, '')
    const win = window.open(
      `${base}?output=1`,
      'tp_output',
      'popup,width=1280,height=720',
    )
    if (win) {
      outputWindowRef.current = win
      setOutputConnected(false)
      const poll = setInterval(() => {
        if (win.closed) {
          clearInterval(poll)
          setOutputConnected(false)
          outputWindowRef.current = null
        }
      }, 1000)
    }
  }, [])

  // ── Auto-save ──────────────────────────────────────────
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return }
    setSaveStatus('saving')
    clearTimeout(saveTimerRef.current)
    clearTimeout(savedTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistScripts(scripts)
      persistActiveId(activeId)
      setSaveStatus('saved')
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }, 800)
    return () => {
      clearTimeout(saveTimerRef.current)
      clearTimeout(savedTimerRef.current)
    }
  }, [scripts, activeId])

  // ── Reset scroll when switching scripts ───────────────
  useEffect(() => {
    if (previewRef.current) previewRef.current.scrollTop = 0
    setIsPlaying(false)
    setCountdownActive(false)
    setCountdownValue(0)
    setScrollRatio(0)
    scrollRatioRef.current = 0
  }, [activeId])

  // ── Script CRUD ────────────────────────────────────────
  const patchScript = useCallback((id: string, patch: Partial<Script>) => {
    setScripts(prev => prev.map(s =>
      s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
    ))
  }, [])

  const setScript = useCallback((content: string) => {
    patchScript(activeId, { content })
  }, [activeId, patchScript])

  const createNewScript = useCallback(() => {
    const s = makeScript('Untitled Script', '')
    setScripts(prev => [s, ...prev])
    setActiveId(s.id)
    setLibraryOpen(true)
  }, [])

  const duplicateScript = useCallback((id: string) => {
    const src = scripts.find(s => s.id === id)
    if (!src) return
    const copy = makeScript(`${src.title} (copy)`, src.content)
    setScripts(prev => {
      const idx = prev.findIndex(x => x.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setActiveId(copy.id)
  }, [scripts])

  const renameScript = useCallback((id: string, title: string) => {
    patchScript(id, { title: title.trim() || 'Untitled Script' })
  }, [patchScript])

  const deleteScript = useCallback((id: string) => {
    const idx = scripts.findIndex(s => s.id === id)
    const remaining = scripts.filter(s => s.id !== id)
    if (remaining.length === 0) {
      const fresh = makeScript('Untitled Script', '')
      setScripts([fresh])
      setActiveId(fresh.id)
      return
    }
    setScripts(remaining)
    if (id === activeId) {
      setActiveId((remaining[Math.max(0, idx - 1)] ?? remaining[0]).id)
    }
  }, [scripts, activeId])

  // ── Import / Export ────────────────────────────────────
  const importFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const content = (e.target?.result as string) ?? ''
      const title = file.name.replace(/\.(txt|md)$/i, '')
      const s = makeScript(title, content)
      setScripts(prev => [s, ...prev])
      setActiveId(s.id)
      setLibraryOpen(true)
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const exportScript = useCallback((format: 'txt' | 'md') => {
    if (!activeScript) return
    const content = format === 'md'
      ? `# ${activeScript.title}\n\n${activeScript.content}`
      : activeScript.content
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeScript.title}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [activeScript])

  // ── Play / pause ───────────────────────────────────────
  const handlePlayPress = useCallback(() => {
    if (countdownActive) {
      setCountdownActive(false)
      setCountdownValue(0)
      return
    }
    if (isPlaying) { setIsPlaying(false); return }
    if (countdownOption > 0) {
      setCountdownActive(true)
      setCountdownValue(countdownOption)
    } else {
      setIsPlaying(true)
    }
  }, [isPlaying, countdownActive, countdownOption])

  useEffect(() => {
    if (!countdownActive) return
    if (countdownValue === 0) { setCountdownActive(false); setIsPlaying(true); return }
    const t = setTimeout(() => setCountdownValue(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [countdownActive, countdownValue])

  // ── Space key ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault()
        handlePlayPress()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlayPress])

  // ── RAF scroll animation ───────────────────────────────
  useEffect(() => {
    if (!isPlaying && !voiceActive) {
      cancelAnimationFrame(rafRef.current)
      lastTimeRef.current = null
      return
    }
    const animate = (ts: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = ts
      const delta = ts - lastTimeRef.current
      lastTimeRef.current = ts
      const el = previewRef.current
      if (el) {
        if (isPlaying) el.scrollTop += (speed * delta) / 1000
        const maxScroll = el.scrollHeight - el.clientHeight
        const vtRatio = voiceTargetRatioRef.current
        if (voiceEnabledRef.current && vtRatio !== null && maxScroll > 0 && ts > voiceGraceUntilRef.current) {
          const targetScrollTop = vtRatio * maxScroll
          const diff = targetScrollTop - el.scrollTop
          const absDiff = Math.abs(diff)
          if (absDiff > 80) {
            const maxStep = Math.min(absDiff * 0.5, 300) * delta / 1000
            el.scrollTop += Math.sign(diff) * maxStep
          }
        }
        const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0
        if (outputConnected) sendSyncRef.current({ type: 'frame', ratio })
        scrollRatioRef.current = ratio
        if (ts - dashboardTickRef.current > 100) {
          setScrollRatio(ratio)
          dashboardTickRef.current = ts
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          setIsPlaying(false)
          setScrollRatio(1)
          return
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(rafRef.current); lastTimeRef.current = null }
  }, [isPlaying, speed, outputConnected, voiceActive])

  // ── Fullscreen ─────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) appRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  // ── Jump / Reset ───────────────────────────────────────
  const jumpBy = useCallback((secs: number) => {
    voiceGraceUntilRef.current = performance.now() + 2000
    const el = previewRef.current
    if (!el) return
    el.scrollTop = Math.max(0, el.scrollTop + speed * secs)
    const maxScroll = el.scrollHeight - el.clientHeight
    const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0
    scrollRatioRef.current = ratio
    setScrollRatio(ratio)
    if (outputConnected) sendSyncRef.current({ type: 'seek', ratio })
  }, [speed, outputConnected])

  const handleReset = useCallback(() => {
    voiceGraceUntilRef.current = performance.now() + 2000
    setIsPlaying(false)
    setCountdownActive(false)
    setCountdownValue(0)
    setScrollRatio(0)
    scrollRatioRef.current = 0
    if (previewRef.current) previewRef.current.scrollTop = 0
    if (outputConnected) sendSyncRef.current({ type: 'seek', ratio: 0 })
  }, [outputConnected])

  // ── Cue navigation ────────────────────────────────────
  const jumpToCue = useCallback((direction: 'prev' | 'next') => {
    const el = previewRef.current
    if (!el) return
    const cueEls = Array.from(el.querySelectorAll<HTMLElement>('.tp-cue'))
    if (cueEls.length === 0) return

    voiceGraceUntilRef.current = performance.now() + 2000
    const elRect = el.getBoundingClientRect()
    // Compute each cue's position within the scrollable container
    const cueScrollTops = cueEls.map(c =>
      c.getBoundingClientRect().top - elRect.top + el.scrollTop
    )
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return

    let target: number | undefined
    if (direction === 'next') {
      target = cueScrollTops.find(t => t > el.scrollTop + 20)
    } else {
      const prev = cueScrollTops.filter(t => t < el.scrollTop - 20)
      target = prev[prev.length - 1]
    }
    if (target === undefined) return

    const clipped = Math.max(0, Math.min(target, maxScroll))
    const ratio = clipped / maxScroll
    el.scrollTop = clipped
    scrollRatioRef.current = ratio
    setScrollRatio(ratio)
    if (outputConnected) sendSyncRef.current({ type: 'seek', ratio })
  }, [outputConnected])

  // ── Cue keyboard shortcuts ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
      if (e.key === '[') { e.preventDefault(); jumpToCue('prev') }
      if (e.key === ']') { e.preventDefault(); jumpToCue('next') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jumpToCue])

  // ── Title inline editing ───────────────────────────────
  const startTitleEdit = () => {
    setDraftTitle(activeScript?.title ?? '')
    setTitleEditing(true)
  }
  const commitTitleEdit = () => {
    renameScript(activeId, draftTitle)
    setTitleEditing(false)
  }

  // ── Resizable divider drag ─────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    if (editorCollapsed) return
    e.preventDefault()

    const startX = e.clientX
    const startW = editorWidth

    const onMove = (ev: MouseEvent) => {
      const maxW = Math.min(EDITOR_MAX_W, window.innerWidth * 0.58)
      setEditorWidth(Math.max(EDITOR_MIN_W, Math.min(maxW, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [editorCollapsed, editorWidth])

  // ── Focus Mode ─────────────────────────────────────────
  const handleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      if (!prev) setLibraryOpen(false) // entering focus: hide library
      return !prev
    })
  }, [])

  const isActive = isPlaying || countdownActive

  // ── Electron: notify main process of presenting state ──
  // This enables the close-while-presenting confirmation dialog.
  // No-op in browser (window.electronAPI is undefined).
  useEffect(() => {
    window.electronAPI?.setPresentingState(isActive)
  }, [isActive])

  // ── Electron: native menu → renderer action bridge ─────
  // A ref holds the latest handlers so the IPC listener (registered once
  // on mount) always calls the current callback without stale closures.
  const menuHandlerRef = useRef<(action: string) => void>(() => {})
  // Update ref every render so the IPC listener always calls the latest handlers
  menuHandlerRef.current = (action: string) => {
    switch (action) {
      case 'new-script':         createNewScript(); break
      case 'toggle-library':     setLibraryOpen(o => !o); break
      case 'play-pause':         handlePlayPress(); break
      case 'reset':              handleReset(); break
      case 'focus-mode':         handleFocusMode(); break
      case 'toggle-appearance':  setSettingsOpen(o => !o); break
      case 'open-output':        openOutputWindow(); break
      case 'prev-cue':           jumpToCue('prev'); break
      case 'next-cue':           jumpToCue('next'); break
    }
  }

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.onMenuAction(action => menuHandlerRef.current(action))
    return () => api.offMenuAction()
  }, []) // Register once; the ref always holds the latest handlers

  // ── Progress readout ───────────────────────────────────
  const pct = Math.round(scrollRatio * 100)
  const remainSecs = Math.max(0, Math.round(stats.totalSecs * (1 - scrollRatio)))
  const remainStr = remainSecs === 0
    ? 'Complete'
    : remainSecs >= 60
      ? `~${Math.floor(remainSecs / 60)}m ${remainSecs % 60}s left`
      : `~${remainSecs}s left`

  const appClass = [
    'app',
    isFullscreen ? 'fullscreen' : '',
    focusMode ? 'focus-mode' : '',
  ].filter(Boolean).join(' ')

  return (
    <div ref={appRef} className={appClass}>
      <header className="header">

        {/* ── Row 1: App bar ── */}
        <div className="header-row row-appbar">
          <div className="brand">
            <span className="brand-dot" />
            <span className="brand-name">TelePrompter</span>
          </div>

          <div className="appbar-rule" />

          <div className="script-meta">
            {titleEditing ? (
              <input
                className="meta-title-input"
                value={draftTitle}
                autoFocus
                onChange={e => setDraftTitle(e.target.value)}
                onBlur={commitTitleEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitTitleEdit()
                  if (e.key === 'Escape') setTitleEditing(false)
                }}
              />
            ) : (
              <span
                className="meta-title"
                onDoubleClick={startTitleEdit}
                title="Double-click to rename"
              >
                {activeScript?.title ?? 'Untitled'}
              </span>
            )}
            <div className="meta-stats">
              <span>{stats.words.toLocaleString()} words</span>
              <span className="meta-dot">·</span>
              <span>~{stats.duration}</span>
            </div>
            <span className={`meta-save${saveStatus !== 'idle' ? ` ${saveStatus}` : ''}`}>
              {saveStatus === 'saving' && 'saving…'}
              {saveStatus === 'saved' && '✓ Saved'}
            </span>
          </div>

          <div className="appbar-actions">
            <button
              className={`btn-toggle${libraryOpen ? ' active' : ''}`}
              onClick={() => setLibraryOpen(o => !o)}
              title="Script library"
            >
              ☰ Scripts
            </button>
            <button
              className={`btn-toggle${dashboardOpen ? ' active' : ''}`}
              onClick={() => setDashboardOpen(o => !o)}
              title="Operator dashboard"
            >
              ⊞ Dashboard
            </button>
            <button
              className={`btn-toggle${voiceOpen ? ' active' : ''}`}
              onClick={() => setVoiceOpen(o => !o)}
              title="Voice tracking"
            >
              🎙 Voice
            </button>
          </div>
        </div>

        {/* ── Row 2: Primary controls ── */}
        <div className="header-row row-primary">
          <button
            className={`btn-play-hero${isActive ? ' playing' : ''}`}
            onClick={handlePlayPress}
            title="Play / Pause [Space]"
          >
            <span className="play-icon">{countdownActive ? '✕' : isPlaying ? '⏸' : '▶'}</span>
            <span className="play-label">{countdownActive ? 'Cancel' : isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="transport-group">
            <button className="btn-transport" onClick={handleReset} title="Reset to top">⏮</button>
            <button className="btn-transport" onClick={() => jumpBy(-5)} title="−5 seconds">−5s</button>
            <button className="btn-transport" onClick={() => jumpBy(5)} title="+5 seconds">+5s</button>
            {cueCount > 0 && <>
              <div className="sep" />
              <button className="btn-transport" onClick={() => jumpToCue('prev')} title="Previous cue  [">◀ Cue</button>
              <button className="btn-transport" onClick={() => jumpToCue('next')} title="Next cue  ]">Cue ▶</button>
            </>}
          </div>

          <div className="sep" />

          <div className="ctrl">
            <label>Speed</label>
            <input type="range" min={10} max={300} value={speed}
              onChange={e => setSpeed(+e.target.value)} className="slider" />
            <span className="val">{speed}</span>
          </div>

          <div className="sep" />

          <div className="ctrl">
            <label>Countdown</label>
            <select value={countdownOption}
              onChange={e => setCountdownOption(+e.target.value)} className="sel">
              <option value={0}>Off</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
            </select>
          </div>

          <div className="sep" />

          <button
            className={`btn-toggle${isFullscreen ? ' active' : ''}`}
            onClick={toggleFullscreen}
            title="Fullscreen [F11]"
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Full'}
          </button>

          <button
            className={`btn-toggle${focusMode ? ' active' : ''}`}
            onClick={handleFocusMode}
            title={focusMode ? 'Exit Focus Mode — restore workspace' : 'Focus Mode — maximize teleprompter view'}
          >
            {focusMode ? '← Workspace' : '⊙ Focus'}
          </button>

          <button
            className={`btn-appearance-toggle${settingsOpen ? ' open' : ''}`}
            onClick={() => setSettingsOpen(o => !o)}
            title="Appearance settings"
          >
            ⚙ Appearance
            <span className="appearance-chevron">{settingsOpen ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* ── Row 3: Collapsible appearance settings ── */}
        {settingsOpen && (
          <div className="header-row row-settings">
            <div className="settings-group">
              <span className="settings-group-label">Colors</span>
              <div className="ctrl">
                <label>Text</label>
                <input type="color" value={settings.textColor}
                  onChange={e => update({ textColor: e.target.value })} className="cpicker" />
              </div>
              <div className="ctrl">
                <label>BG</label>
                <input type="color" value={settings.bgColor}
                  onChange={e => update({ bgColor: e.target.value })} className="cpicker" />
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-group">
              <span className="settings-group-label">Layout</span>
              <button
                className={`btn-toggle${settings.mirror ? ' active' : ''}`}
                onClick={() => update({ mirror: !settings.mirror })}
              >
                ⇔ Mirror
              </button>
              <div className="ctrl">
                <label>Dir</label>
                <select value={settings.direction}
                  onChange={e => update({ direction: e.target.value as 'auto' | 'ltr' | 'rtl' })}
                  className="sel">
                  <option value="auto">Auto</option>
                  <option value="ltr">LTR</option>
                  <option value="rtl">RTL</option>
                </select>
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-group">
              <span className="settings-group-label">Typography</span>
              <div className="ctrl">
                <label>Font</label>
                <select value={settings.fontFamily}
                  onChange={e => update({ fontFamily: e.target.value })} className="sel">
                  {FONT_FAMILY_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="ctrl">
                <label>Size</label>
                <input type="range" min={16} max={96} value={settings.fontSize}
                  onChange={e => update({ fontSize: +e.target.value })} className="slider" />
                <span className="val">{settings.fontSize}px</span>
              </div>
              <div className="ctrl">
                <label>LH</label>
                <input type="range" min={1} max={2.5} step={0.05} value={settings.lineHeight}
                  onChange={e => update({ lineHeight: +e.target.value })} className="slider" />
                <span className="val">{settings.lineHeight.toFixed(2)}</span>
              </div>
              <div className="ctrl">
                <label>LS</label>
                <input type="range" min={0} max={5} step={0.1} value={settings.letterSpacing}
                  onChange={e => update({ letterSpacing: +e.target.value })} className="slider" />
                <span className="val">{settings.letterSpacing.toFixed(1)}</span>
              </div>
              <div className="ctrl">
                <label>Align</label>
                <select value={settings.textAlign}
                  onChange={e => update({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
                  className="sel">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-group">
              <span className="settings-group-label">Guide</span>
              <button className={`btn-toggle${guideVisible ? ' active' : ''}`}
                onClick={() => setGuideVisible(v => !v)}>
                {guideVisible ? 'On' : 'Off'}
              </button>
              {guideVisible && (
                <>
                  <div className="ctrl">
                    <label>Color</label>
                    <input type="color" value={guideColor}
                      onChange={e => setGuideColor(e.target.value)} className="cpicker" />
                  </div>
                  <div className="ctrl">
                    <label>Opacity</label>
                    <input type="range" min={0.05} max={1} step={0.05} value={guideOpacity}
                      onChange={e => setGuideOpacity(+e.target.value)} className="slider" />
                    <span className="val">{Math.round(guideOpacity * 100)}%</span>
                  </div>
                </>
              )}
            </div>

            <span className="hint">Space = play/pause · F11 = fullscreen</span>
          </div>
        )}
      </header>

      {/* ── Reading progress strip ── */}
      <div className="progress-strip" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
        <div className={`progress-labels${scrollRatio > 0 ? ' visible' : ''}`}>
          <span className="progress-pct">{pct}%</span>
          {stats.totalSecs > 0 && (
            <span className="progress-remaining">{remainStr}</span>
          )}
        </div>
      </div>

      <main className="main">

        {/* ── Script library sidebar ── */}
        {libraryOpen && !focusMode && (
          <ScriptLibrary
            scripts={filteredScripts}
            activeId={activeId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={id => setActiveId(id)}
            onCreate={createNewScript}
            onRename={renameScript}
            onDelete={deleteScript}
            onDuplicate={duplicateScript}
          />
        )}

        {/* ── Editor panel — always rendered when not in focus mode, width animates on collapse ── */}
        {!focusMode && (
          <section
            className={`panel editor-panel${editorCollapsed ? ' collapsed' : ''}`}
            style={{
              width: editorCollapsed ? 48 : editorWidth,
              minWidth: editorCollapsed ? 48 : EDITOR_MIN_W,
              maxWidth: editorCollapsed ? 48 : EDITOR_MAX_W,
            }}
          >
            {/* Collapsed strip — fades in when collapsed */}
            <div
              className="editor-collapsed-inner"
              onClick={() => setEditorCollapsed(false)}
              role="button"
              tabIndex={editorCollapsed ? 0 : -1}
              title="Click to expand script panel"
              onKeyDown={e => e.key === 'Enter' && setEditorCollapsed(false)}
            >
              <span className="collapsed-expand-icon">›</span>
              <span className="collapsed-script-label">Script</span>
              <span className="collapsed-script-name">{activeScript?.title ?? 'Untitled'}</span>
            </div>

            {/* Expanded content — fades out when collapsed */}
            <div className="editor-expanded-inner">
              <div className="editor-toolbar">
                <label className="btn-tool" title="Import .txt or .md file">
                  ↓ Import
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) importFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button className="btn-tool" onClick={() => exportScript('txt')} title="Export as plain text">
                  ↑ TXT
                </button>
                <button className="btn-tool" onClick={() => exportScript('md')} title="Export as Markdown">
                  ↑ MD
                </button>
                <button
                  className="btn-tool editor-collapse-btn"
                  onClick={() => setEditorCollapsed(true)}
                  title="Collapse panel"
                >
                  ‹
                </button>
              </div>

              <textarea
                className="script-editor"
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="Paste your script here…"
                spellCheck={false}
                tabIndex={editorCollapsed ? -1 : 0}
              />

              <div className="stats-bar">
                <span>{stats.words.toLocaleString()} words</span>
                <span>{stats.chars.toLocaleString()} chars</span>
                <span>~{stats.duration} to read</span>
                {activeScript && (
                  <>
                    <span className="stats-dot">·</span>
                    <span>Created {fmtDate(activeScript.createdAt)}</span>
                    <span>Modified {fmtDate(activeScript.updatedAt)}</span>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Divider — drag to resize, hover to reveal collapse toggle ── */}
        {!focusMode && (
          <div
            className={`divider${isDragging ? ' dragging' : ''}`}
            style={{ cursor: editorCollapsed ? 'default' : 'col-resize' }}
            onMouseDown={editorCollapsed ? undefined : handleDividerMouseDown}
            title={editorCollapsed ? '' : 'Drag to resize'}
          >
            <button
              className="divider-toggle"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setEditorCollapsed(c => !c)}
              title={editorCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {editorCollapsed ? '›' : '‹'}
            </button>
          </div>
        )}

        {/* ── Teleprompter preview ── */}
        <section className="panel preview-panel">
          <div className="teleprompter-wrap">
            <div
              ref={previewRef}
              className="teleprompter"
              style={{
                backgroundColor: settings.bgColor,
                transform: settings.mirror ? 'scaleX(-1)' : undefined,
              }}
            >
              <div
                className="tp-text"
                dir={settings.direction}
                style={{
                  color: settings.textColor,
                  fontSize: settings.fontSize,
                  fontFamily: fontFamilyCss(settings.fontFamily),
                  lineHeight: settings.lineHeight,
                  letterSpacing: `${settings.letterSpacing}px`,
                  textAlign: settings.textAlign,
                }}
              >
                {script ? renderScript(script) : 'Your script will appear here…'}
              </div>
            </div>

            {guideVisible && (
              <div
                className="reading-guide"
                style={{ backgroundColor: guideColor, opacity: guideOpacity }}
              />
            )}

            {countdownActive && countdownValue > 0 && (
              <div className="countdown-overlay">
                <span className="countdown-number" key={countdownValue}>
                  {countdownValue}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Operator Dashboard ── */}
        {dashboardOpen && (
          <OperatorDashboard
            isPlaying={isPlaying}
            scrollRatio={scrollRatio}
            totalWords={stats.words}
            speed={speed}
            outputConnected={outputConnected}
            cueCount={cueCount}
            onPlayPause={handlePlayPress}
            onJump={jumpBy}
            onSpeedChange={setSpeed}
            onOpenOutput={openOutputWindow}
            onJumpToCue={jumpToCue}
          />
        )}

        {/* ── Voice Tracker ── */}
        {voiceOpen && (
          <VoiceTracker
            status={voice.status}
            transcript={voice.transcript}
            targetRatio={voice.targetRatio}
            scrollRatio={scrollRatio}
            language={voice.language}
            errorMessage={voice.errorMessage}
            onStart={voice.start}
            onStop={voice.stop}
            onLanguageChange={voice.setLanguage}
          />
        )}
      </main>
    </div>
  )
}
