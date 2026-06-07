import { useState, useEffect, useCallback } from 'react'
import type { Playlist } from '../lib/types'
import { loadPlaylists, persistPlaylists, makePlaylist } from '../lib/storage'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists)

  useEffect(() => { persistPlaylists(playlists) }, [playlists])

  const createPlaylist = useCallback((name: string): Playlist => {
    const pl = makePlaylist(name)
    setPlaylists(prev => [...prev, pl])
    return pl
  }, [])

  const renamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists(prev => prev.map(pl =>
      pl.id === id
        ? { ...pl, name: name.trim() || 'Untitled Playlist', updatedAt: Date.now() }
        : pl,
    ))
  }, [])

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists(prev => prev.filter(pl => pl.id !== id))
  }, [])

  const addScript = useCallback((playlistId: string, scriptId: string) => {
    setPlaylists(prev => prev.map(pl =>
      pl.id === playlistId && !pl.scriptIds.includes(scriptId)
        ? { ...pl, scriptIds: [...pl.scriptIds, scriptId], updatedAt: Date.now() }
        : pl,
    ))
  }, [])

  const removeScript = useCallback((playlistId: string, scriptId: string) => {
    setPlaylists(prev => prev.map(pl =>
      pl.id === playlistId
        ? { ...pl, scriptIds: pl.scriptIds.filter(id => id !== scriptId), updatedAt: Date.now() }
        : pl,
    ))
  }, [])

  const moveScript = useCallback((playlistId: string, from: number, to: number) => {
    setPlaylists(prev => prev.map(pl => {
      if (pl.id !== playlistId) return pl
      const ids = [...pl.scriptIds]
      const [moved] = ids.splice(from, 1)
      ids.splice(to, 0, moved)
      return { ...pl, scriptIds: ids, updatedAt: Date.now() }
    }))
  }, [])

  const removeScriptFromAll = useCallback((scriptId: string) => {
    setPlaylists(prev => prev.map(pl =>
      pl.scriptIds.includes(scriptId)
        ? { ...pl, scriptIds: pl.scriptIds.filter(id => id !== scriptId), updatedAt: Date.now() }
        : pl,
    ))
  }, [])

  return {
    playlists,
    createPlaylist, renamePlaylist, deletePlaylist,
    addScript, removeScript, moveScript, removeScriptFromAll,
  }
}
