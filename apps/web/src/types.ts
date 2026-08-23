export type Principal = { sessionId: string; kind: 'temporary' | 'device'; deviceId?: string; name: string }

export type Device = {
  id: string
  name: string
  current?: boolean
  online?: boolean
  lastSeenAt: number
  lastIp?: string
  expiresAt?: number
}

export type Message = {
  id: string
  type: 'text' | 'file'
  content?: string
  fileName?: string
  mime?: string
  size?: number
  sha256?: string
  sourceDeviceId?: string
  sourceSessionId?: string
  sourceDeviceName?: string
  targetDeviceIds?: string[]
  visibility: 'normal' | 'trusted_only'
  favorite: boolean
  pinned: boolean
  deletedAt?: number | null
  createdAt: number
  updatedAt: number
  ocrText?: string
  ocrStatus?: 'none' | 'pending' | 'processing' | 'complete' | 'failed'
  tags?: string[]
  note?: string
  snippet?: string
  matchScope?: 'text' | 'fileName' | 'imageName' | 'ocr'
  downloadUrl?: string
}

export type Share = {
  id: string
  messageId: string
  token?: string
  url?: string
  fileName?: string
  expiresAt: number
  maxDownloads?: number | null
  downloads: number
  revokedAt?: number | null
  hasCode?: boolean
  createdAt: number
}

export type Drop = {
  id: string
  token?: string
  url?: string
  name: string
  expiresAt: number
  maxUploads?: number | null
  uploads: number
  maxFileSize?: number | null
  allowedTypes?: string[]
  revokedAt?: number | null
  createdAt: number
}

export type Settings = {
  ocrEnabled: boolean
  ocr?: { completed: number; pending: number; processing: number; failed: number }
  storage?: { used?: number; limit?: number | null; text?: number; images?: number; files?: number; trash?: number }
  retention?: { imagesDays?: number; filesDays?: number; trashDays?: number; downloadedEarlier?: boolean }
  defaultShare?: { expiresIn: number; maxDownloads?: number | null }
  retentionDays?: number
}

export type UploadTask = {
  id: string
  file: File
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'
  error?: string
  controller?: AbortController
  targetDeviceIds?: string[]
}

export type SearchFilters = {
  text: boolean
  fileName: boolean
  imageName: boolean
  imageText: boolean
  type: 'all' | 'text' | 'file' | 'image' | 'video' | 'media' | 'audio' | 'link' | 'document' | 'archive' | 'other'
  deviceId?: string
  sourceName?: string
  dateFrom?: string
  dateTo?: string
  favorite: boolean
  pinned: boolean
  privateOnly: boolean
}
