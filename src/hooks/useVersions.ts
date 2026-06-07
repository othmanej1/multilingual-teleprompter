import { useState, useEffect, useCallback } from 'react'
import type { ScriptVersion } from '../lib/types'
import { loadVersions, persistVersions, makeVersion } from '../lib/storage'

const MAX_PER_SCRIPT = 10

export function useVersions() {
  const [versions, setVersions] = useState<ScriptVersion[]>(loadVersions)

  useEffect(() => { persistVersions(versions) }, [versions])

  const saveVersion = useCallback((scriptId: string, content: string, label: string) => {
    setVersions(prev => {
      const newV = makeVersion(scriptId, content, label)
      const next = [newV, ...prev]
      // Keep only the newest MAX_PER_SCRIPT versions per script
      const forScript = next.filter(v => v.scriptId === scriptId)
      if (forScript.length > MAX_PER_SCRIPT) {
        const toRemove = new Set(forScript.slice(MAX_PER_SCRIPT).map(v => v.id))
        return next.filter(v => !toRemove.has(v.id))
      }
      return next
    })
  }, [])

  const deleteVersion = useCallback((id: string) => {
    setVersions(prev => prev.filter(v => v.id !== id))
  }, [])

  const pruneForScript = useCallback((scriptId: string) => {
    setVersions(prev => prev.filter(v => v.scriptId !== scriptId))
  }, [])

  return { versions, saveVersion, deleteVersion, pruneForScript }
}
