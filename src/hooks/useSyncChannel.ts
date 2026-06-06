import { useEffect, useRef, useCallback } from 'react'
import type { SyncMessage } from '../lib/types'

const CHANNEL_NAME = 'tp_output_sync'

export function useSyncChannel(onMessage?: (msg: SyncMessage) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = ch
    ch.onmessage = (e: MessageEvent<SyncMessage>) => cbRef.current?.(e.data)
    return () => { ch.close(); channelRef.current = null }
  }, [])

  const send = useCallback((msg: SyncMessage) => {
    channelRef.current?.postMessage(msg)
  }, [])

  return send
}
