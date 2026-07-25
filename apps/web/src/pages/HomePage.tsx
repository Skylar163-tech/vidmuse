import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  api,
  formatDuration,
  formatLabel,
  type ParseResponse,
} from '../lib/api'
import { loadSession, notesPathFromSession, saveSession, clearSession } from '../lib/videoSession'

export function HomePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [info, setInfo] = useState<ParseResponse | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [jobStatus, setJobStatus] = useState('')
  const [healthMsg, setHealthMsg] = useState('')
  const [thumbFailed, setThumbFailed] = useState(false)

  useEffect(() => {
    const qUrl = params.get('url')
    if (qUrl) setUrl(qUrl)
    else {
      const session = loadSession()
      if (session?.url) setUrl(session.url)
    }
  }, [params])

  useEffect(() => {
    api
      .health()
      .then((h) => {
        if (h.message) setHealthMsg(h.message)
        else if (h.yt_dlp) {
          const ds = h.deepseek ? ' · DeepSeek 已就绪' : ''
          setHealthMsg(`引擎就绪 · yt-dlp ${h.yt_dlp}${ds}`)
        }
      })
      .catch(() => setHealthMsg('后端未连接，请先启动 API'))
  }, [])

  useEffect(() => {
    if (!jobId) return
    let alive = true
    const tick = async () => {
      try {
        const job = await api.job(jobId)
        if (!alive) return
        setProgress(job.progress)
        setJobStatus(job.status)
        if (job.status === 'done') {
          const a = document.createElement('a')
          a.href = api.fileUrl(jobId)
          a.download = job.filename || 'video'
          document.body.appendChild(a)
          a.click()
          a.remove()
          setJobId(null)
          return
        }
        if (job.status === 'error') {
          setError(job.error || '下载失败')
          setJobId(null)
          return
        }
        window.setTimeout(tick, 800)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : '轮询失败')
        setJobId(null)
      }
    }
    tick()
    return () => {
      alive = false
    }
  }, [jobId])

  const preferredFormats = useMemo(() => {
    if (!info) return []
    return info.formats.slice(0, 12)
  }, [info])

  function persistInfo(data: ParseResponse, sourceUrl: string, formatId: string) {
    saveSession({
      url: sourceUrl.trim() || data.webpage_url || '',
      title: data.title,
      formats: data.formats,
      selectedFormatId: formatId,
    })
  }

  async function onParse(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo(null)
    setSelected('')
    setJobId(null)
    setProgress(0)
    setThumbFailed(false)
    const trimmed = url.trim()
    if (!trimmed) {
      setError('请粘贴视频链接')
      return
    }
    setParsing(true)
    try {
      const data = await api.parse(trimmed)
      setInfo(data)
      const first = data.formats[0]
      const formatId = first?.format_id || ''
      if (first) setSelected(formatId)
      persistInfo(data, trimmed, formatId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
    } finally {
      setParsing(false)
    }
  }

  async function onDownload() {
    if (!info || !selected) return
    setError('')
    setProgress(0)
    setJobStatus('queued')
    const trimmed = url.trim() || info.webpage_url || ''
    persistInfo(info, trimmed, selected)
    try {
      const { job_id } = await api.download(trimmed, selected)
      setJobId(job_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建下载失败')
    }
  }

  function goNotes() {
    if (!info) return
    const trimmed = url.trim() || info.webpage_url || ''
    persistInfo(info, trimmed, selected)
    navigate(notesPathFromSession())
  }

  function onClear() {
    setUrl('')
    setInfo(null)
    setSelected('')
    setError('')
    setJobId(null)
    setProgress(0)
    setJobStatus('')
    setThumbFailed(false)
    clearSession()
  }

  const canClear = Boolean(url.trim() || info || error || jobId)

  return (
    <div>
      <section className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-sm font-medium tracking-[0.2em] text-accent">VIDMUSE</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          把视频变成可复用的创作笔记
        </h1>
        <p className="mt-4 text-base text-muted sm:text-lg">
          结构化要点与章节；需要精看或二创时，再一键下载原片。
        </p>

        <form onSubmit={onParse} className="mt-10">
          <div
            className={`flex flex-col gap-3 rounded-2xl border border-line bg-surface p-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center ${
              parsing ? 'animate-pulse-glow' : ''
            }`}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴 B站 / 抖音 / 小红书等视频链接…"
              className="h-12 flex-1 rounded-xl bg-transparent px-4 text-base text-ink outline-none placeholder:text-muted/70 focus:ring-0"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={parsing || !!jobId}
              className="h-12 shrink-0 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {parsing ? '解析中…' : '解析'}
            </button>
            {canClear && (
              <button
                type="button"
                onClick={onClear}
                disabled={parsing || !!jobId}
                className="h-12 shrink-0 rounded-xl border border-line px-4 text-sm font-medium text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                清空
              </button>
            )}
          </div>
        </form>

        {healthMsg && <p className="mt-3 text-xs text-muted">{healthMsg}</p>}
        {error && (
          <p className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-hover">
            {error}
          </p>
        )}
      </section>

      <section className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3 text-center text-xs text-muted sm:text-sm">
        <div className="rounded-xl border border-line bg-surface/60 px-3 py-4">AI 学习笔记</div>
        <div className="rounded-xl border border-line bg-surface/60 px-3 py-4">章节要点</div>
        <div className="rounded-xl border border-line bg-surface/60 px-3 py-4">原片可下载</div>
      </section>

      {parsing && (
        <div className="mx-auto mt-10 max-w-2xl space-y-3">
          <div className="skeleton h-40 rounded-2xl" />
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
        </div>
      )}

      {info && !parsing && (
        <section className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            {info.thumbnail && !thumbFailed ? (
              <img
                src={api.thumbnailUrl(info.thumbnail)}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setThumbFailed(true)}
                className="h-36 w-full rounded-xl object-cover sm:h-28 sm:w-44"
              />
            ) : (
              <div className="flex h-36 w-full items-center justify-center rounded-xl bg-surface-2 text-muted sm:h-28 sm:w-44">
                无封面
              </div>
            )}
            <div className="min-w-0 flex-1 text-left">
              <h2 className="truncate text-lg font-semibold">{info.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {info.uploader || info.extractor || '未知来源'} · {formatDuration(info.duration)}
              </p>
            </div>
          </div>

          <div className="border-t border-line px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goNotes}
                className="h-12 flex-1 rounded-xl bg-accent text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                生成学习笔记
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={!selected || !!jobId}
                className="h-12 flex-1 rounded-xl border border-line bg-transparent text-sm font-semibold text-ink transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {jobId ? `下载中 ${Math.round(progress)}%` : '下载到本地'}
              </button>
            </div>

            <label className="mb-2 mt-5 block text-left text-xs uppercase tracking-wider text-muted">
              下载清晰度
            </label>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value)
                if (info) persistInfo(info, url.trim() || info.webpage_url || '', e.target.value)
              }}
              className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
            >
              {preferredFormats.map((f) => (
                <option key={f.format_id} value={f.format_id}>
                  {formatLabel(f)}
                </option>
              ))}
            </select>

            {jobId && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.max(4, progress)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">状态：{jobStatus || 'running'}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
