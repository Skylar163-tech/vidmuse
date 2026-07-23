import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  formatBytes,
  formatDuration,
  type FormatInfo,
  type ParseResponse,
} from '../lib/api'

function formatLabel(f: FormatInfo): string {
  const bits = [
    f.resolution || (f.vcodec ? '视频' : '音频'),
    f.ext?.toUpperCase(),
    f.format_note,
    f.fps ? `${Math.round(f.fps)}fps` : null,
    formatBytes(f.filesize || f.filesize_approx),
  ].filter(Boolean)
  return bits.join(' · ')
}

export function HomePage() {
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
    api
      .health()
      .then((h) => {
        if (h.message) setHealthMsg(h.message)
        else if (h.yt_dlp) setHealthMsg(`引擎就绪 · yt-dlp ${h.yt_dlp}`)
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
    // Prefer muxed or high video; keep top 12 for UI
    return info.formats.slice(0, 12)
  }, [info])

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
      if (first) setSelected(first.format_id)
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
    try {
      const { job_id } = await api.download(url.trim(), selected)
      setJobId(job_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建下载失败')
    }
  }

  return (
    <div>
      <section className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-sm font-medium tracking-[0.2em] text-accent">VIDMUSE</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          一键保存，任意平台
        </h1>
        <p className="mt-4 text-base text-muted sm:text-lg">
          粘贴链接，选清晰度，立刻下载。手机也能用。
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
              placeholder="粘贴视频链接…"
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
          </div>
        </form>

        {healthMsg && (
          <p className="mt-3 text-xs text-muted">{healthMsg}</p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-hover">
            {error}
          </p>
        )}
      </section>

      <section className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3 text-center text-xs text-muted sm:text-sm">
        <div className="rounded-xl border border-line bg-surface/60 px-3 py-4">1800+ 站点</div>
        <div className="rounded-xl border border-line bg-surface/60 px-3 py-4">高清可选</div>
        <div className="rounded-xl border border-line bg-surface/60 px-3 py-4">手机友好</div>
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
            <label className="mb-2 block text-left text-xs uppercase tracking-wider text-muted">
              选择清晰度
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
            >
              {preferredFormats.map((f) => (
                <option key={f.format_id} value={f.format_id}>
                  {formatLabel(f)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onDownload}
              disabled={!selected || !!jobId}
              className="mt-4 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {jobId ? `下载中 ${Math.round(progress)}%` : '开始下载'}
            </button>

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

      <Link
        to="/pro"
        className="mx-auto mt-10 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-accent/25 bg-gradient-to-r from-accent/15 to-transparent px-5 py-4 transition hover:border-accent/50"
      >
        <div className="text-left">
          <p className="text-sm font-semibold">升级 Pro</p>
          <p className="mt-0.5 text-xs text-muted">批量下载 · AI 总结 · 字幕翻译</p>
        </div>
        <span className="text-accent">→</span>
      </Link>
    </div>
  )
}
