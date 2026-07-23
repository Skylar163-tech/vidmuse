export type FormatInfo = {
  format_id: string
  ext: string
  resolution?: string | null
  fps?: number | null
  vcodec?: string | null
  acodec?: string | null
  filesize?: number | null
  filesize_approx?: number | null
  tbr?: number | null
  note?: string | null
  format_note?: string | null
}

export type ParseResponse = {
  id: string
  title: string
  thumbnail?: string | null
  duration?: number | null
  uploader?: string | null
  webpage_url?: string | null
  extractor?: string | null
  formats: FormatInfo[]
}

export type JobStatus = {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'error' | string
  progress: number
  error?: string | null
  filename?: string | null
  title?: string | null
}

export type HealthResponse = {
  ok: boolean
  yt_dlp?: string | null
  ffmpeg: boolean
  message?: string | null
}

export type AiSummaryResponse = {
  title: string
  summary: string
  bullets: string[]
  pro_required: boolean
}

export type AiTranslateResponse = {
  title: string
  language_from: string
  language_to: string
  lines: { start: string; end: string; original: string; translated: string }[]
  pro_required: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.detail === 'string') detail = data.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  parse: (url: string) =>
    request<ParseResponse>('/api/parse', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  download: (url: string, format_id: string) =>
    request<{ job_id: string }>('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url, format_id }),
    }),
  job: (jobId: string) => request<JobStatus>(`/api/jobs/${jobId}`),
  fileUrl: (jobId: string) => `/api/jobs/${jobId}/file`,
  thumbnailUrl: (raw: string) => `/api/thumbnail?url=${encodeURIComponent(raw)}`,
  summary: (payload: { url?: string; title?: string }) =>
    request<AiSummaryResponse>('/api/ai/summary', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  translate: (payload: { url?: string; title?: string }) =>
    request<AiTranslateResponse>('/api/ai/translate-subs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
