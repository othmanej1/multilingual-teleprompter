import { useState, useRef, useEffect, memo } from 'react'
import type { Script } from '../lib/types'
import './ScriptLibrary.css'

interface Props {
  scripts: Script[]
  activeId: string
  searchQuery: string
  onSearchChange: (q: string) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

function wordCount(content: string): number {
  const t = content.trim()
  return t ? t.split(/\s+/).length : 0
}

function readTime(content: string): string {
  const secs = Math.round((wordCount(content) / 130) * 60)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function relDate(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  const dt = new Date(ts)
  if (d < 7 * 86_400_000) return dt.toLocaleDateString('en', { weekday: 'short' })
  return dt.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export const ScriptLibrary = memo(function ScriptLibrary({
  scripts, activeId, searchQuery, onSearchChange,
  onSelect, onCreate, onRename, onDelete, onDuplicate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  const startRename = (s: Script, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDeleteId(null)
    setEditingId(s.id)
    setEditingTitle(s.title)
  }

  const commitRename = () => {
    if (editingId) {
      onRename(editingId, editingTitle)
      setEditingId(null)
    }
  }

  const handleSelect = (id: string) => {
    onSelect(id)
    setConfirmDeleteId(null)
    setEditingId(null)
  }

  return (
    <aside className="script-library">
      <div className="lib-header">
        <span className="lib-heading">Scripts ({scripts.length})</span>
        <button className="lib-new" onClick={onCreate}>+ New</button>
      </div>

      <div className="lib-search-wrap">
        <input
          type="search"
          placeholder="Search by title…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="lib-search"
        />
      </div>

      <ul className="lib-list">
        {scripts.length === 0 && (
          <li className="lib-empty">
            {searchQuery ? 'No matching scripts' : 'No scripts yet'}
          </li>
        )}

        {scripts.map(s => (
          <li
            key={s.id}
            className={`lib-item${s.id === activeId ? ' active' : ''}`}
            onClick={() => handleSelect(s.id)}
          >
            <div className="lib-body">
              {editingId === s.id ? (
                <input
                  ref={editRef}
                  className="lib-rename"
                  value={editingTitle}
                  onChange={e => setEditingTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                    e.stopPropagation()
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="lib-title"
                  title={s.title}
                  onDoubleClick={e => startRename(s, e)}
                >
                  {s.title}
                </span>
              )}
              <div className="lib-meta">
                <span>{wordCount(s.content).toLocaleString()} words</span>
                <span>~{readTime(s.content)}</span>
                <span>{relDate(s.updatedAt)}</span>
              </div>
            </div>

            {confirmDeleteId === s.id ? (
              <div className="lib-confirm" onClick={e => e.stopPropagation()}>
                <span>Delete?</span>
                <button
                  className="lib-confirm-yes"
                  onClick={() => { onDelete(s.id); setConfirmDeleteId(null) }}
                >Yes</button>
                <button
                  className="lib-confirm-no"
                  onClick={() => setConfirmDeleteId(null)}
                >No</button>
              </div>
            ) : (
              <div className="lib-actions" onClick={e => e.stopPropagation()}>
                <button title="Rename" onClick={e => startRename(s, e)}>✎</button>
                <button title="Duplicate" onClick={() => onDuplicate(s.id)}>⧉</button>
                <button
                  title="Delete"
                  onClick={() => setConfirmDeleteId(s.id)}
                >✕</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
})
