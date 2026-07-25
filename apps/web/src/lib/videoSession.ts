import type { FormatInfo } from './api'

const STORAGE_KEY = 'vidmuse_video_session'

export type VideoSession = {
  url: string
  title: string
  formats: FormatInfo[]
  selectedFormatId: string
  savedAt: number
}

export function saveSession( partial: {
  url: string
  title?: string
  formats?: FormatInfo[]
  selectedFormatId?: string
}): void {
  const prev = loadSession()
  const next: VideoSession = {
    url: partial.url.trim(),
    title: (partial.title ?? prev?.title ?? '').trim(),
    formats: partial.formats ?? prev?.formats ?? [],
    selectedFormatId: partial.selectedFormatId ?? prev?.selectedFormatId ?? '',
    savedAt: Date.now(),
  }
  if (!next.url) return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadSession(): VideoSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as VideoSession
    if (!data?.url || typeof data.url !== 'string') return null
    return {
      url: data.url,
      title: typeof data.title === 'string' ? data.title : '',
      formats: Array.isArray(data.formats) ? data.formats : [],
      selectedFormatId: typeof data.selectedFormatId === 'string' ? data.selectedFormatId : '',
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function notesPathFromSession(session?: VideoSession | null): string {
  const s = session ?? loadSession()
  if (!s?.url) return '/ai'
  const q = new URLSearchParams()
  q.set('url', s.url)
  if (s.title) q.set('title', s.title)
  return `/ai?${q.toString()}`
}
