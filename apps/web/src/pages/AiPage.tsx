import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  api,
  formatLabel,
  summaryToMarkdown,
  translateToMarkdown,
  type AiQuotaResponse,
  type AiSummaryResponse,
  type AiTranslateResponse,
  type FormatInfo,
} from '../lib/api'
import { loadSession, saveSession } from '../lib/videoSession'

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

/** Survive React StrictMode remount so auto-summary only fires once per URL (unless user re-submits). */
const autoSummaryStarted = new Set<string>()

export function AiPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [formats, setFormats] = useState<FormatInfo[]>([])
  const [selectedFormatId, setSelectedFormatId] = useState('')
  const [parsing, setParsing] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [translateLoading, setTranslateLoading] = useState(false)
  const [error, setError] = useState('')
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [summary, setSummary] = useState<AiSummaryResponse | null>(null)
  const [subs, setSubs] = useState<AiTranslateResponse | null>(null)
  const [copied, setCopied] = useState('')
  const [quota, setQuota] = useState<AiQuotaResponse | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [jobStatus, setJobStatus] = useState('')
  const [activeUrl, setActiveUrl] = useState('')
  /** One panel at a time so summary + 80 subtitle lines don't stack forever. */
  const [resultTab, setResultTab] = useState<'summary' | 'translate'>('summary')
  const [chaptersOpen, setChaptersOpen] = useState(false)

  function refreshQuota() {
    api
      .aiQuota()
      .then(setQuota)
      .catch(() => setQuota(null))
  }

  useEffect(() => {
    const session = loadSession()
    const qUrl = params.get('url') || session?.url || ''
    const qTitle = params.get('title') || session?.title || ''
    if (qUrl) {
      setUrl(qUrl)
      setActiveUrl(qUrl)
    }
    if (qTitle) setTitle(qTitle)
    if (session?.formats?.length) {
      setFormats(session.formats)
      setSelectedFormatId(session.selectedFormatId || session.formats[0]?.format_id || '')
    }
    refreshQuota()
  }, [params])

  useEffect(() => {
    const trimmed = activeUrl.trim()
    if (!trimmed) return
    if (autoSummaryStarted.has(trimmed)) return
    autoSummaryStarted.add(trimmed)
    void runSummary(trimmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-run once per active url
  }, [activeUrl])

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

  function resetResults() {
    setSummary(null)
    setSubs(null)
    setCopied('')
    setError('')
    setQuotaExceeded(false)
    setResultTab('summary')
    setChaptersOpen(false)
  }

  async function onParseAndStart(e: FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) {
      setError('请粘贴视频链接')
      return
    }
    setParsing(true)
    setError('')
    setQuotaExceeded(false)
    try {
      const data = await api.parse(trimmed)
      const formatId = data.formats[0]?.format_id || ''
      setTitle(data.title)
      setFormats(data.formats)
      setSelectedFormatId(formatId)
      saveSession({
        url: trimmed,
        title: data.title,
        formats: data.formats,
        selectedFormatId: formatId,
      })
      resetResults()
      // Allow auto-summary again for this (or new) URL after user explicitly submits
      autoSummaryStarted.delete(trimmed)
      setActiveUrl(trimmed)
      setUrl(trimmed)
      navigate(`/ai?url=${encodeURIComponent(trimmed)}&title=${encodeURIComponent(data.title)}`, {
        replace: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
    } finally {
      setParsing(false)
    }
  }

  async function runSummary(overrideUrl?: string) {
    setError('')
    setQuotaExceeded(false)
    setCopied('')
    const trimmed = (overrideUrl ?? (activeUrl || url)).trim()
    if (!trimmed) {
      setError('请填写视频链接')
      return
    }
    setSummaryLoading(true)
    try {
      const data = await api.summary({ url: trimmed, title: title || undefined })
      setSummary(data)
      if (data.title) {
        setTitle(data.title)
        saveSession({ url: trimmed, title: data.title })
      }
      refreshQuota()
    } catch (e) {
      const err = e as Error & { status?: number }
      setError(err.message || '请求失败')
      if (err.status === 429) setQuotaExceeded(true)
      refreshQuota()
    } finally {
      setSummaryLoading(false)
    }
  }

  async function runTranslate() {
    setError('')
    setQuotaExceeded(false)
    setCopied('')
    const trimmed = (activeUrl || url).trim()
    if (!trimmed) {
      setError('请填写视频链接')
      return
    }
    setTranslateLoading(true)
    try {
      const data = await api.translate({ url: trimmed, title: title || undefined, language_to: 'zh' })
      setSubs(data)
      setResultTab('translate')
      if (data.title && !title) setTitle(data.title)
      refreshQuota()
    } catch (e) {
      const err = e as Error & { status?: number }
      setError(err.message || '请求失败')
      if (err.status === 429) setQuotaExceeded(true)
      refreshQuota()
    } finally {
      setTranslateLoading(false)
    }
  }

  async function onDownloadHere() {
    const trimmed = (activeUrl || url).trim()
    if (!trimmed) {
      setError('缺少视频链接')
      return
    }
    if (!formats.length || !selectedFormatId) {
      navigate(`/?url=${encodeURIComponent(trimmed)}`)
      return
    }
    setError('')
    setProgress(0)
    setJobStatus('queued')
    saveSession({
      url: trimmed,
      title,
      formats,
      selectedFormatId,
    })
    try {
      const { job_id } = await api.download(trimmed, selectedFormatId)
      setJobId(job_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建下载失败')
    }
  }

  async function onCopySummary() {
    if (!summary) return
    try {
      await copyText(summaryToMarkdown(summary))
      setCopied('summary')
    } catch {
      setError('复制失败，请手动选择文本')
    }
  }

  async function onCopyTranslate() {
    if (!subs) return
    try {
      await copyText(translateToMarkdown(subs))
      setCopied('translate')
    } catch {
      setError('复制失败，请手动选择文本')
    }
  }

  const preferredFormats = formats.slice(0, 12)
  const workingUrl = (activeUrl || url).trim()

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <p className="text-sm font-medium tracking-[0.2em] text-accent">学习笔记</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">看完，变成要点</h1>
        <p className="mt-3 text-muted">
          基于真实字幕生成笔记；翻译可单独使用。免费每日约 3 次 AI 体验。
        </p>
        {quota && quota.limit > 0 && (
          <p className="mt-2 text-xs text-muted">
            今日额度：已用 {quota.used}/{quota.limit}，剩余 {quota.remaining}
          </p>
        )}
      </div>

      <form onSubmit={onParseAndStart} className="mt-10 space-y-3 rounded-2xl border border-line bg-surface p-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴视频链接…"
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="可选：视频标题"
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={parsing || summaryLoading}
            className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {parsing ? '解析中…' : '解析并开始'}
          </button>
          {!workingUrl && (
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium transition hover:border-accent/50"
            >
              回首页
            </Link>
          )}
        </div>
        {workingUrl && title && (
          <p className="truncate text-left text-xs text-muted">
            当前：{title}
          </p>
        )}
        {error && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-left text-sm text-accent-hover">
            <p>{error}</p>
            {quotaExceeded && (
              <Link to="/pro" className="mt-2 inline-block font-medium underline">
                了解 Pro →
              </Link>
            )}
            {!quotaExceeded && error.includes('字幕') && (
              <button
                type="button"
                onClick={onDownloadHere}
                className="mt-2 block text-sm font-medium text-accent underline"
              >
                下载本片精看
              </button>
            )}
          </div>
        )}
      </form>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <div
          className="mb-4 flex gap-1 rounded-xl border border-line bg-surface-2 p-1"
          role="tablist"
          aria-label="结果视图"
        >
          <button
            type="button"
            role="tab"
            aria-selected={resultTab === 'summary'}
            onClick={() => setResultTab('summary')}
            className={`h-9 flex-1 rounded-lg text-sm font-medium transition ${
              resultTab === 'summary'
                ? 'bg-surface text-white shadow-sm'
                : 'text-muted hover:text-white'
            }`}
          >
            视频总结
            {summaryLoading ? '…' : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resultTab === 'translate'}
            onClick={() => setResultTab('translate')}
            className={`h-9 flex-1 rounded-lg text-sm font-medium transition ${
              resultTab === 'translate'
                ? 'bg-surface text-white shadow-sm'
                : 'text-muted hover:text-white'
            }`}
          >
            字幕翻译
            {subs ? ` · ${subs.lines.length}` : translateLoading ? '…' : ''}
          </button>
        </div>

        {resultTab === 'summary' && (
          <section role="tabpanel">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted">要点与章节；翻译请切到另一页签。</p>
              <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                AI
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runSummary()}
                disabled={!workingUrl || summaryLoading}
                className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {summaryLoading ? '生成中…' : summary ? '重新生成' : '生成学习笔记'}
              </button>
              {summary && (
                <button
                  type="button"
                  onClick={onCopySummary}
                  className="h-10 rounded-xl border border-line px-4 text-sm font-medium transition hover:border-accent/50"
                >
                  {copied === 'summary' ? '已复制' : '复制 Markdown'}
                </button>
              )}
              <button
                type="button"
                onClick={onDownloadHere}
                disabled={!workingUrl || !!jobId}
                className="h-10 rounded-xl border border-line px-4 text-sm font-medium transition hover:border-accent/50 disabled:opacity-60"
              >
                {jobId ? `下载中 ${Math.round(progress)}%` : '下载本片'}
              </button>
            </div>

            {preferredFormats.length > 0 && (
              <div className="mt-3">
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted">
                  下载清晰度
                </label>
                <select
                  value={selectedFormatId}
                  onChange={(e) => {
                    setSelectedFormatId(e.target.value)
                    saveSession({
                      url: workingUrl,
                      title,
                      formats,
                      selectedFormatId: e.target.value,
                    })
                  }}
                  className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
                >
                  {preferredFormats.map((f) => (
                    <option key={f.format_id} value={f.format_id}>
                      {formatLabel(f)}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

            {summaryLoading && !summary && (
              <p className="mt-4 text-sm text-muted">正在拉取字幕并生成笔记…</p>
            )}

            {summary && (
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs text-muted">
                    {summary.title}
                    {summary.subtitle_lang ? ` · 字幕 ${summary.subtitle_lang}` : ''}
                    {summary.truncated ? ' · 内容已截断' : ''}
                  </p>
                  <p className="mt-2 text-muted">{summary.summary}</p>
                </div>
                {summary.bullets.length > 0 && (
                  <ul className="space-y-2">
                    {summary.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="text-accent">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.chapters.length > 0 && (
                  <div className="border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() => setChaptersOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-sm transition hover:border-accent/40"
                    >
                      <span className="font-medium">
                        章节
                        <span className="ml-2 text-xs font-normal text-muted">
                          {summary.chapters.length} 段
                        </span>
                      </span>
                      <span className="text-xs text-muted">{chaptersOpen ? '收起' : '展开'}</span>
                    </button>
                    {chaptersOpen && (
                      <div className="mt-2 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                        {summary.chapters.map((ch) => (
                          <div
                            key={`${ch.start}-${ch.title}`}
                            className="rounded-xl border border-line bg-surface-2 px-3 py-2"
                          >
                            <p className="font-medium">
                              <span className="text-accent">{ch.start}</span> {ch.title}
                            </p>
                            {ch.points.length > 0 && (
                              <ul className="mt-1 space-y-1 text-muted">
                                {ch.points.map((p) => (
                                  <li key={p}>– {p}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {resultTab === 'translate' && (
          <section role="tabpanel">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted">可与总结并行；列表在区域内滚动，不拉长整页。</p>
              <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                AI
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setResultTab('translate')
                  void runTranslate()
                }}
                disabled={!workingUrl || translateLoading}
                className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {translateLoading ? '翻译中…' : '翻译为中文'}
              </button>
              {subs && (
                <button
                  type="button"
                  onClick={onCopyTranslate}
                  className="h-10 rounded-xl border border-line px-4 text-sm font-medium transition hover:border-accent/50"
                >
                  {copied === 'translate' ? '已复制' : '复制 Markdown'}
                </button>
              )}
            </div>
            {translateLoading && !subs && (
              <p className="mt-4 text-sm text-muted">正在翻译字幕…</p>
            )}
            {subs && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted">
                  {subs.language_from} → {subs.language_to} · {subs.title}
                </p>
                <div className="max-h-[60vh] space-y-1.5 overflow-y-auto rounded-xl border border-line bg-surface-2/50 p-2">
                  {subs.lines.map((line) => {
                    const same =
                      line.original.trim() === line.translated.trim()
                    return (
                      <div
                        key={`${line.start}-${line.original.slice(0, 12)}`}
                        className="rounded-lg border border-line/80 bg-surface px-2.5 py-1.5 text-sm"
                      >
                        <p className="text-[11px] text-muted">
                          {line.start} – {line.end}
                        </p>
                        {!same && (
                          <p className="mt-0.5 text-xs text-muted">{line.original}</p>
                        )}
                        <p className={same ? 'mt-0.5' : 'mt-0.5'}>{line.translated}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
