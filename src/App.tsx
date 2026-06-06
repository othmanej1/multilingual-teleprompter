import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { ScriptLibrary } from './components/ScriptLibrary'
import {
  loadScripts, persistScripts, loadActiveId, persistActiveId, makeScript,
} from './lib/storage'
import type { Script, SaveStatus } from './lib/types'

type Direction = 'auto' | 'ltr' | 'rtl'

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

// ── One-time localStorage bootstrap ───────────────────────
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

export default function App() {
  // ── Phase 2B: script management ────────────────────────
  const [scripts, setScripts] = useState<Script[]>(bootstrapScripts)
  const [activeId, setActiveId] = useState<string>(bootstrapActiveId)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [titleEditing, setTitleEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isInitialMount = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Phase 1: playback controls ─────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [fontSize, setFontSize] = useState(32)
  const [textColor, setTextColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState('#0a0a0f')
  const [mirror, setMirror] = useState(false)
  const [direction, setDirection] = useState<Direction>('auto')

  // ── Phase 2A: fullscreen + guide + countdown ───────────
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [guideVisible, setGuideVisible] = useState(true)
  const [guideColor, setGuideColor] = useState('#ffffff')
  const [guideOpacity, setGuideOpacity] = useState(0.25)
  const [countdownOption, setCountdownOption] = useState(0)
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownValue, setCountdownValue] = useState(0)

  const appRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number | null>(null)

  // ── Derived: active script ─────────────────────────────
  const activeScript = scripts.find(s => s.id === activeId) ?? scripts[0]
  const script = activeScript?.content ?? ''

  const filteredScripts = useMemo(
    () => searchQuery
      ? scripts.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : scripts,
    [scripts, searchQuery],
  )

  // ── Statistics ─────────────────────────────────────────
  const stats = useMemo(() => {
    const trimmed = script.trim()
    if (!trimmed) return { words: 0, chars: 0, duration: '0s' }
    const words = trimmed.split(/\s+/).length
    const chars = script.length
    const totalSecs = Math.round((words / 130) * 60)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return { words, chars, duration: mins > 0 ? `${mins}m ${secs}s` : `${secs}s` }
  }, [script])

  // ── Auto-save to localStorage ──────────────────────────
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

  // ── Play / pause (with countdown) ─────────────────────
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

  // ── Scroll animation ───────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
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
        el.scrollTop += (speed * delta) / 1000
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          setIsPlaying(false)
          return
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(rafRef.current); lastTimeRef.current = null }
  }, [isPlaying, speed])

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
    const el = previewRef.current
    if (!el) return
    el.scrollTop = Math.max(0, el.scrollTop + speed * secs)
  }, [speed])

  const handleReset = useCallback(() => {
    setIsPlaying(false)
    setCountdownActive(false)
    setCountdownValue(0)
    if (previewRef.current) previewRef.current.scrollTop = 0
  }, [])

  // ── Title inline editing ───────────────────────────────
  const startTitleEdit = () => {
    setDraftTitle(activeScript?.title ?? '')
    setTitleEditing(true)
  }

  const commitTitleEdit = () => {
    renameScript(activeId, draftTitle)
    setTitleEditing(false)
  }

  const playLabel = countdownActive ? '✕ Cancel' : isPlaying ? '⏸ Pause' : '▶ Play'
  const playClass = `btn-play${isPlaying || countdownActive ? ' playing' : ''}`

  return (
    <div ref={appRef} className={`app${isFullscreen ? ' fullscreen' : ''}`}>
      <header className="header">

        {/* ── Row 1: brand / library / playback / fullscreen ── */}
        <div className="header-row">
          <div className="brand">
            <span className="brand-dot" />
            <span className="brand-name">TelePrompter</span>
          </div>

          <button
            className={`btn-toggle${libraryOpen ? ' active' : ''}`}
            onClick={() => setLibraryOpen(o => !o)}
            title="Script library"
          >
            ☰ Scripts
          </button>

          <div className="sep" />

          <button className={playClass} onClick={handlePlayPress} title="Play / Pause [Space]">
            {playLabel}
          </button>
          <button className="btn-secondary" onClick={() => jumpBy(-5)} title="Jump back 5s">⏪ −5s</button>
          <button className="btn-secondary" onClick={() => jumpBy(5)} title="Jump forward 5s">⏩ +5s</button>
          <button className="btn-secondary" onClick={handleReset} title="Reset to top">⏮ Reset</button>

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

          <div className="ctrl">
            <label>Speed</label>
            <input type="range" min={10} max={300} value={speed}
              onChange={e => setSpeed(+e.target.value)} className="slider" />
            <span className="val">{speed}</span>
          </div>

          <div className="ctrl">
            <label>Size</label>
            <input type="range" min={16} max={96} value={fontSize}
              onChange={e => setFontSize(+e.target.value)} className="slider" />
            <span className="val">{fontSize}px</span>
          </div>

          <div className="sep" />

          <button
            className={`btn-toggle${isFullscreen ? ' active' : ''}`}
            onClick={toggleFullscreen} title="Fullscreen [F11]"
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Full'}
          </button>
        </div>

        {/* ── Row 2: appearance / guide / hint ── */}
        <div className="header-row">
          <div className="ctrl">
            <label>Text</label>
            <input type="color" value={textColor}
              onChange={e => setTextColor(e.target.value)} className="cpicker" />
          </div>
          <div className="ctrl">
            <label>BG</label>
            <input type="color" value={bgColor}
              onChange={e => setBgColor(e.target.value)} className="cpicker" />
          </div>
          <button className={`btn-toggle${mirror ? ' active' : ''}`}
            onClick={() => setMirror(m => !m)}>⇔ Mirror</button>
          <div className="ctrl">
            <label>Dir</label>
            <select value={direction}
              onChange={e => setDirection(e.target.value as Direction)} className="sel">
              <option value="auto">Auto</option>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL</option>
            </select>
          </div>

          <div className="sep" />

          <button className={`btn-toggle${guideVisible ? ' active' : ''}`}
            onClick={() => setGuideVisible(v => !v)}>― Guide</button>
          {guideVisible && (
            <>
              <div className="ctrl">
                <label>Line</label>
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

          <span className="hint">Space = play/pause · F11 = fullscreen</span>
        </div>
      </header>

      <main className="main">

        {/* ── Script Library sidebar ── */}
        {libraryOpen && (
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

        {/* ── Editor panel ── */}
        <section className="panel editor-panel">
          <div className="editor-toolbar">
            <div className="script-title-area">
              {titleEditing ? (
                <input
                  className="script-title-input"
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
                  className="script-title-label"
                  onDoubleClick={startTitleEdit}
                  title="Double-click to rename"
                >
                  {activeScript?.title ?? 'Untitled'}
                </span>
              )}
            </div>

            <div className="toolbar-right">
              {/* Import: label wraps hidden file input */}
              <label className="btn-tool" title="Import .txt or .md">
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
              <span className={`save-badge${saveStatus !== 'idle' ? ` ${saveStatus}` : ''}`}>
                {saveStatus === 'saving' && 'saving…'}
                {saveStatus === 'saved' && '✓ Saved'}
              </span>
            </div>
          </div>

          <textarea
            className="script-editor"
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="Paste your script here…"
            spellCheck={false}
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
        </section>

        <div className="divider" />

        {/* ── Teleprompter preview ── */}
        <section className="panel preview-panel">
          <div className="panel-label">Teleprompter Preview</div>
          <div className="teleprompter-wrap">
            <div
              ref={previewRef}
              className="teleprompter"
              style={{
                backgroundColor: bgColor,
                transform: mirror ? 'scaleX(-1)' : undefined,
              }}
            >
              <div
                className="tp-text"
                dir={direction}
                style={{ color: textColor, fontSize }}
              >
                {script || 'Your script will appear here…'}
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
      </main>
    </div>
  )
}
