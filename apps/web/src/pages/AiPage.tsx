import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AiSummaryResponse, type AiTranslateResponse } from '../lib/api'

export function AiPage() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState<'summary' | 'translate' | null>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<AiSummaryResponse | null>(null)
  const [subs, setSubs] = useState<AiTranslateResponse | null>(null)

  async function runSummary() {
    setError('')
    setLoading('summary')
    try {
      const data = await api.summary({ url: url || undefined, title: title || undefined })
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function runTranslate() {
    setError('')
    setLoading('translate')
    try {
      const data = await api.translate({ url: url || undefined, title: title || undefined })
      setSubs(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <p className="text-sm font-medium tracking-[0.2em] text-accent">VIDMUSE AI</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">看完，变成要点</h1>
        <p className="mt-3 text-muted">
          总结与字幕翻译当前为演示占位，完整能力需{' '}
          <Link to="/pro" className="text-accent hover:underline">
            Pro
          </Link>
          。
        </p>
      </div>

      <div className="mt-10 space-y-3 rounded-2xl border border-line bg-surface p-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="可选：视频链接"
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="可选：视频标题"
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-accent-hover">{error}</p>}
      </div>

      <div className="mt-6 grid gap-5">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">视频总结</h2>
            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              Pro
            </span>
          </div>
          <button
            type="button"
            onClick={runSummary}
            disabled={loading !== null}
            className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading === 'summary' ? '生成中…' : '生成演示总结'}
          </button>
          {summary && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-muted">{summary.summary}</p>
              <ul className="space-y-2">
                {summary.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-accent">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">字幕翻译</h2>
            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              Pro
            </span>
          </div>
          <button
            type="button"
            onClick={runTranslate}
            disabled={loading !== null}
            className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading === 'translate' ? '翻译中…' : '生成演示字幕'}
          </button>
          {subs && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted">
                {subs.language_from} → {subs.language_to} · {subs.title}
              </p>
              {subs.lines.map((line) => (
                <div key={line.start} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                  <p className="text-xs text-muted">
                    {line.start} – {line.end}
                  </p>
                  <p className="mt-1 text-muted">{line.original}</p>
                  <p className="mt-0.5">{line.translated}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
