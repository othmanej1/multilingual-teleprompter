import { useState, useRef, useEffect, useMemo, memo } from 'react'
import type { Script, Folder } from '../lib/types'
import './ScriptLibrary.css'

interface Props {
  scripts: Script[]
  activeId: string
  folders: Folder[]
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveToFolder: (scriptId: string, folderId: string | null) => void
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
  scripts, activeId, folders,
  onSelect, onCreate, onRename, onDelete, onDuplicate,
  onCreateFolder, onRenameFolder, onDeleteFolder, onMoveToFolder,
}: Props) {
  // ── Filter state ──────────────────────────────────────────
  const [searchQuery, setSearchQuery]         = useState('')
  const [searchContent, setSearchContent]     = useState(false)
  const [dateFilter, setDateFilter]           = useState<'all' | '7d' | '30d'>('all')

  // ── Script editing state ──────────────────────────────────
  const [editingId, setEditingId]             = useState<string | null>(null)
  const [editingTitle, setEditingTitle]       = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [movingScriptId, setMovingScriptId]   = useState<string | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  // ── Folder editing state ──────────────────────────────────
  const [creatingFolder, setCreatingFolder]           = useState(false)
  const [newFolderName, setNewFolderName]               = useState('')
  const [editingFolderId, setEditingFolderId]           = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName]       = useState('')
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null)

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  // ── Filtering ─────────────────────────────────────────────
  const dateThreshold = useMemo(() => {
    if (dateFilter === '7d')  return Date.now() - 7  * 86_400_000
    if (dateFilter === '30d') return Date.now() - 30 * 86_400_000
    return 0
  }, [dateFilter])

  const filteredScripts = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return scripts.filter(s => {
      if (q) {
        const matchTitle   = s.title.toLowerCase().includes(q)
        const matchContent = searchContent && s.content.toLowerCase().includes(q)
        if (!matchTitle && !matchContent) return false
      }
      if (dateThreshold > 0 && s.updatedAt < dateThreshold) return false
      return true
    })
  }, [scripts, searchQuery, searchContent, dateThreshold])

  const hasFolders = folders.length > 0

  // Groups for folder mode
  const folderGroups = useMemo(() => {
    if (!hasFolders) return null
    const categorizedIds = new Set(folders.map(f => f.id))
    return {
      byFolder: folders.map(f => ({
        folder: f,
        scripts: filteredScripts.filter(s => s.folderId === f.id),
      })),
      uncategorized: filteredScripts.filter(
        s => !s.folderId || !categorizedIds.has(s.folderId),
      ),
    }
  }, [hasFolders, folders, filteredScripts])

  // ── Handlers ──────────────────────────────────────────────
  const startRename = (s: Script, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDeleteId(null)
    setMovingScriptId(null)
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
    setMovingScriptId(null)
  }

  const commitFolderRename = () => {
    if (editingFolderId) {
      onRenameFolder(editingFolderId, editingFolderName)
      setEditingFolderId(null)
    }
  }

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim())
      setNewFolderName('')
      setCreatingFolder(false)
    }
  }

  // ── Script item renderer ──────────────────────────────────
  const renderScript = (s: Script) => (
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

      {movingScriptId === s.id ? (
        <div className="lib-move-wrap" onClick={e => e.stopPropagation()}>
          <select
            className="lib-move-select"
            defaultValue={s.folderId ?? ''}
            onChange={e => {
              onMoveToFolder(s.id, e.target.value || null)
              setMovingScriptId(null)
            }}
          >
            <option value="">Uncategorized</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            className="lib-move-cancel"
            onClick={() => setMovingScriptId(null)}
          >✕</button>
        </div>
      ) : confirmDeleteId === s.id ? (
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
          {hasFolders && (
            <button title="Move to folder" onClick={() => setMovingScriptId(s.id)}>⤐</button>
          )}
          <button title="Delete" onClick={() => setConfirmDeleteId(s.id)}>✕</button>
        </div>
      )}
    </li>
  )

  return (
    <aside className="script-library">
      {/* ── Header ── */}
      <div className="lib-header">
        <span className="lib-heading">Scripts ({scripts.length})</span>
        <div className="lib-header-btns">
          <button className="lib-new" onClick={onCreate}>+ Script</button>
          <button
            className="lib-folder-btn"
            onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
            title="Create a new folder"
          >+ Folder</button>
        </div>
      </div>

      {/* ── New-folder input ── */}
      {creatingFolder && (
        <div className="lib-folder-create">
          <input
            autoFocus
            type="text"
            className="lib-folder-input"
            placeholder="Folder name…"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
            }}
          />
          <button className="lib-confirm-yes" onClick={handleCreateFolder}>Create</button>
          <button
            className="lib-confirm-no"
            onClick={() => { setCreatingFolder(false); setNewFolderName('') }}
          >✕</button>
        </div>
      )}

      {/* ── Search + content-search toggle ── */}
      <div className="lib-search-wrap">
        <input
          type="search"
          placeholder={searchContent ? 'Search in content…' : 'Search by title…'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="lib-search"
        />
        <button
          className={`lib-content-toggle${searchContent ? ' active' : ''}`}
          onClick={() => setSearchContent(v => !v)}
          title={searchContent ? 'Title search only' : 'Also search inside content'}
        >✦</button>
      </div>

      {/* ── Date filter (shown when folders exist or date filter active) ── */}
      {(hasFolders || dateFilter !== 'all') && (
        <div className="lib-filters">
          <select
            className="lib-filter-select"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as 'all' | '7d' | '30d')}
          >
            <option value="all">Any date</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      )}

      {/* ── List ── */}
      <ul className="lib-list">
        {folderGroups ? (
          /* Folder mode */
          <>
            {folderGroups.byFolder.map(({ folder: f, scripts: fScripts }) => (
              <li key={f.id} className="lib-folder-section">
                <div className="lib-folder-header">
                  <span className="lib-folder-icon">📁</span>
                  {editingFolderId === f.id ? (
                    <input
                      autoFocus
                      className="lib-folder-rename"
                      value={editingFolderName}
                      onChange={e => setEditingFolderName(e.target.value)}
                      onBlur={commitFolderRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitFolderRename()
                        if (e.key === 'Escape') setEditingFolderId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="lib-folder-name"
                      onDoubleClick={() => {
                        setEditingFolderId(f.id)
                        setEditingFolderName(f.name)
                      }}
                      title="Double-click to rename"
                    >
                      {f.name}
                    </span>
                  )}
                  <span className="lib-folder-count">{fScripts.length}</span>
                  {confirmDeleteFolderId === f.id ? (
                    <div className="lib-folder-confirm" onClick={e => e.stopPropagation()}>
                      <button
                        className="lib-confirm-yes"
                        onClick={() => { onDeleteFolder(f.id); setConfirmDeleteFolderId(null) }}
                      >Del</button>
                      <button
                        className="lib-confirm-no"
                        onClick={() => setConfirmDeleteFolderId(null)}
                      >✕</button>
                    </div>
                  ) : (
                    <div className="lib-folder-actions" onClick={e => e.stopPropagation()}>
                      <button
                        title="Rename folder"
                        onClick={() => { setEditingFolderId(f.id); setEditingFolderName(f.name) }}
                      >✎</button>
                      <button
                        title="Delete folder — scripts become uncategorized"
                        onClick={() => setConfirmDeleteFolderId(f.id)}
                      >✕</button>
                    </div>
                  )}
                </div>
                <ul className="lib-folder-items">
                  {fScripts.length === 0 && (
                    <li className="lib-folder-empty">Empty folder</li>
                  )}
                  {fScripts.map(renderScript)}
                </ul>
              </li>
            ))}

            {folderGroups.uncategorized.length > 0 && (
              <li className="lib-folder-section lib-uncategorized">
                <div className="lib-folder-header">
                  <span className="lib-folder-icon">📄</span>
                  <span className="lib-folder-name lib-folder-name-dim">Uncategorized</span>
                  <span className="lib-folder-count">{folderGroups.uncategorized.length}</span>
                </div>
                <ul className="lib-folder-items">
                  {folderGroups.uncategorized.map(renderScript)}
                </ul>
              </li>
            )}

            {filteredScripts.length === 0 && (
              <li className="lib-empty">
                {searchQuery ? 'No matching scripts' : 'No scripts yet'}
              </li>
            )}
          </>
        ) : (
          /* Flat mode */
          <>
            {filteredScripts.length === 0 && (
              <li className="lib-empty">
                {searchQuery ? 'No matching scripts' : 'No scripts yet'}
              </li>
            )}
            {filteredScripts.map(renderScript)}
          </>
        )}
      </ul>
    </aside>
  )
})
