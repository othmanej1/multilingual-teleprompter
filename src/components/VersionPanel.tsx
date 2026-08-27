import { useState, memo } from 'react'
import type { ScriptVersion } from '../lib/types'
import './VersionPanel.css'

interface Props {
  scriptId: string
  scriptTitle: string
  currentContent: string
  versions: ScriptVersion[]
  onSave: (scriptId: string, content: string, label: string) => void
  onRestore: (version: ScriptVersion) => void
  onDelete: (id: string) => void
}

function fmtTs(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
  }
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return d.toLocaleString('en', opts)
}

export const VersionPanel = memo(function VersionPanel({
  scriptId, scriptTitle, currentContent,
  versions, onSave, onRestore, onDelete,
}: Props) {
  const [label, setLabel] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null)

  const scriptVersions = versions.filter(v => v.scriptId === scriptId)

  const handleSave = () => {
    onSave(scriptId, currentContent, label.trim())
    setLabel('')
  }

  return (
    <aside className="version-panel">
      <div className="vp-header">
        <span className="vp-title">Versions</span>
        <span className="vp-script-name" title={scriptTitle}>{scriptTitle}</span>
      </div>

      <div className="vp-save-row">
        <input
          type="text"
          className="vp-label-input"
          placeholder="Optional label…"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          maxLength={80}
        />
        <button className="vp-save-btn" onClick={handleSave} title="Snapshot current content">
          Save
        </button>
      </div>

      <ul className="vp-list">
        {scriptVersions.length === 0 && (
          <li className="vp-empty">
            No versions yet.<br />
            Press <strong>Save</strong> to snapshot the current content,<br />
            or edit the script to trigger an auto-snapshot.
          </li>
        )}

        {scriptVersions.map(v => (
          <li key={v.id} className="vp-item">
            <div className="vp-item-top">
              <span className="vp-item-ts">{fmtTs(v.savedAt)}</span>
              <span className={`vp-item-label${!v.label ? ' auto' : ''}`}>
                {v.label || 'auto'}
              </span>
            </div>
            <div className="vp-item-preview">
              {v.content.slice(0, 100)}{v.content.length > 100 ? '…' : ''}
            </div>

            {confirmRestoreId === v.id ? (
              <div className="vp-confirm-row">
                <span className="vp-confirm-msg">Restore this version?</span>
                <button className="vp-confirm-yes" onClick={() => { onRestore(v); setConfirmRestoreId(null) }}>Yes</button>
                <button className="vp-confirm-no" onClick={() => setConfirmRestoreId(null)}>No</button>
              </div>
            ) : confirmDeleteId === v.id ? (
              <div className="vp-confirm-row">
                <span className="vp-confirm-msg">Delete version?</span>
                <button className="vp-confirm-yes" onClick={() => { onDelete(v.id); setConfirmDeleteId(null) }}>Yes</button>
                <button className="vp-confirm-no" onClick={() => setConfirmDeleteId(null)}>No</button>
              </div>
            ) : (
              <div className="vp-item-actions">
                <button className="vp-btn-restore" onClick={() => setConfirmRestoreId(v.id)} title="Restore this version">
                  ↺ Restore
                </button>
                <button
                  type="button"
                  className="vp-btn-delete"
                  onClick={() => setConfirmDeleteId(v.id)}
                  title="Delete version"
                  aria-label={`Delete version from ${fmtTs(v.savedAt)}`}
                >
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
})
