import { useState, memo } from 'react'
import type { Playlist, Script } from '../lib/types'
import './PlaylistPanel.css'

interface Props {
  playlists: Playlist[]
  scripts: Script[]
  activePlaylistId: string | null
  playlistIdx: number
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onAddScript: (playlistId: string, scriptId: string) => void
  onRemoveScript: (playlistId: string, scriptId: string) => void
  onMoveScript: (playlistId: string, from: number, to: number) => void
  onActivate: (playlistId: string) => void
  onDeactivate: () => void
  onSelectScript: (scriptId: string) => void
}

function totalDuration(playlist: Playlist, scripts: Script[]): string {
  let secs = 0
  for (const id of playlist.scriptIds) {
    const s = scripts.find(x => x.id === id)
    if (s) {
      const words = s.content.trim() ? s.content.trim().split(/\s+/).length : 0
      secs += Math.round((words / 130) * 60)
    }
  }
  if (secs === 0) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export const PlaylistPanel = memo(function PlaylistPanel({
  playlists, scripts, activePlaylistId, playlistIdx,
  onCreate, onDelete, onRename, onAddScript, onRemoveScript, onMoveScript,
  onActivate, onDeactivate, onSelectScript,
}: Props) {
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(playlists[0]?.id ?? null)
  const [addingToId, setAddingToId] = useState<string | null>(null)

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    onCreate(name)
    setNewName('')
    setCreatingNew(false)
    // Auto-expand newly created playlist
    setExpandedId(`expand-pending`)
  }

  const startRename = (pl: Playlist, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(pl.id)
    setEditingName(pl.name)
  }

  const commitRename = () => {
    if (editingId) {
      onRename(editingId, editingName)
      setEditingId(null)
    }
  }

  return (
    <aside className="playlist-panel">
      <div className="ppl-header">
        <span className="ppl-title">Playlists ({playlists.length})</span>
        {!creatingNew && (
          <button className="ppl-new-btn" onClick={() => setCreatingNew(true)}>+ New</button>
        )}
      </div>

      {creatingNew && (
        <div className="ppl-create-row">
          <input
            autoFocus
            type="text"
            className="ppl-name-input"
            placeholder="Playlist name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreatingNew(false); setNewName('') }
            }}
          />
          <button className="ppl-create-btn" onClick={handleCreate}>Create</button>
          <button className="ppl-cancel-btn" onClick={() => { setCreatingNew(false); setNewName('') }}>✕</button>
        </div>
      )}

      <div className="ppl-list">
        {playlists.length === 0 && !creatingNew && (
          <div className="ppl-empty">
            No playlists yet.<br />
            Create one to queue scripts for sequential playback.
          </div>
        )}

        {playlists.map(pl => {
          const isActive = pl.id === activePlaylistId
          const isExpanded = expandedId === pl.id
          const available = scripts.filter(s => !pl.scriptIds.includes(s.id))

          return (
            <div key={pl.id} className={`ppl-item${isActive ? ' active' : ''}`}>
              {/* Playlist header row */}
              <div
                className="ppl-item-header"
                onClick={() => setExpandedId(isExpanded ? null : pl.id)}
              >
                <span className="ppl-chevron">{isExpanded ? '▾' : '▸'}</span>

                {editingId === pl.id ? (
                  <input
                    autoFocus
                    className="ppl-rename-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditingId(null)
                      e.stopPropagation()
                    }}
                  />
                ) : (
                  <span
                    className="ppl-name"
                    onDoubleClick={e => startRename(pl, e)}
                    title="Double-click to rename"
                  >
                    {pl.name}
                  </span>
                )}

                <span className="ppl-count">{pl.scriptIds.length}</span>

                <div className="ppl-item-actions" onClick={e => e.stopPropagation()}>
                  {isActive ? (
                    <button
                      className="ppl-btn ppl-btn-stop"
                      onClick={onDeactivate}
                      title="Deactivate playlist"
                    >■</button>
                  ) : (
                    <button
                      className="ppl-btn ppl-btn-play"
                      onClick={() => { setExpandedId(pl.id); onActivate(pl.id) }}
                      title="Activate playlist for sequential playback"
                      disabled={pl.scriptIds.length === 0}
                    >▶</button>
                  )}

                  {confirmDeleteId === pl.id ? (
                    <>
                      <button
                        className="ppl-btn ppl-confirm-yes"
                        onClick={() => { onDelete(pl.id); setConfirmDeleteId(null) }}
                      >Del</button>
                      <button
                        className="ppl-btn ppl-confirm-no"
                        onClick={() => setConfirmDeleteId(null)}
                      >✕</button>
                    </>
                  ) : (
                    <button
                      className="ppl-btn ppl-btn-del"
                      onClick={() => setConfirmDeleteId(pl.id)}
                      title="Delete playlist"
                    >✕</button>
                  )}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="ppl-scripts">
                  <div className="ppl-duration">~{totalDuration(pl, scripts)} total</div>

                  {pl.scriptIds.length === 0 ? (
                    <div className="ppl-scripts-empty">No scripts — add some below</div>
                  ) : (
                    <ul className="ppl-script-list">
                      {pl.scriptIds.map((sid, idx) => {
                        const s = scripts.find(x => x.id === sid)
                        const isCurrent = isActive && idx === playlistIdx
                        return (
                          <li key={sid} className={`ppl-script-item${isCurrent ? ' current' : ''}`}>
                            <span className="ppl-script-num">{idx + 1}</span>
                            <span
                              className="ppl-script-title"
                              onClick={() => onSelectScript(sid)}
                              title={s ? `Go to: ${s.title}` : 'Script deleted'}
                            >
                              {s?.title ?? '(deleted)'}
                            </span>
                            <div className="ppl-script-btns">
                              <button
                                className="ppl-sbtn"
                                disabled={idx === 0}
                                onClick={() => onMoveScript(pl.id, idx, idx - 1)}
                                title="Move up"
                              >↑</button>
                              <button
                                className="ppl-sbtn"
                                disabled={idx === pl.scriptIds.length - 1}
                                onClick={() => onMoveScript(pl.id, idx, idx + 1)}
                                title="Move down"
                              >↓</button>
                              <button
                                className="ppl-sbtn ppl-sbtn-del"
                                onClick={() => onRemoveScript(pl.id, sid)}
                                title="Remove from playlist"
                              >✕</button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {addingToId === pl.id ? (
                    <div className="ppl-add-row">
                      <select
                        className="ppl-add-select"
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) {
                            onAddScript(pl.id, e.target.value)
                            setAddingToId(null)
                          }
                        }}
                      >
                        <option value="" disabled>— choose script —</option>
                        {available.map(s => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                      <button
                        className="ppl-cancel-btn"
                        onClick={() => setAddingToId(null)}
                      >✕</button>
                    </div>
                  ) : (
                    <button
                      className="ppl-add-btn"
                      disabled={available.length === 0}
                      onClick={() => setAddingToId(pl.id)}
                    >
                      + Add Script
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
})
