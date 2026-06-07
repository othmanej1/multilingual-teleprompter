import { useState, useEffect, useCallback } from 'react'
import type { Folder } from '../lib/types'
import { loadFolders, persistFolders, makeFolder } from '../lib/storage'

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>(loadFolders)

  useEffect(() => { persistFolders(folders) }, [folders])

  const createFolder = useCallback((name: string): Folder => {
    const f = makeFolder(name)
    setFolders(prev => [...prev, f])
    return f
  }, [])

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f =>
      f.id === id ? { ...f, name: name.trim() || 'Untitled Folder' } : f,
    ))
  }, [])

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id))
  }, [])

  return { folders, createFolder, renameFolder, deleteFolder }
}
