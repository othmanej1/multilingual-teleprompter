export interface Script {
  id: string
  title: string
  content: string
  createdAt: number // Unix ms
  updatedAt: number // Unix ms
}

export type SaveStatus = 'idle' | 'saving' | 'saved'
