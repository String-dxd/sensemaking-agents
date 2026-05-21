export type ShareStatus = 'idle' | 'creating' | 'ready' | 'revoking' | 'error'

export default class ShareTokenBridge {
  static instance: ShareTokenBridge | null
  static getInstance(): ShareTokenBridge | undefined

  status: ShareStatus
  token: string | null
  url: string | null
  showQuotes: boolean
  errorCode: string | null
  errorMessage: string | null

  constructor()
  dispose(): void
  subscribe(listener: (bridge: ShareTokenBridge) => void): () => void
  ensureToken(): Promise<void>
  createToken(): Promise<void>
  revokeToken(): Promise<void>
  setShowQuotes(next: boolean): Promise<void>
  retry(): Promise<void>
}
