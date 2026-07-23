import { Link } from 'react-router-dom'

const freeFeatures = ['单链接解析下载', '常见清晰度选择', '手机浏览器可用']
const proFeatures = [
  '批量队列下载',
  'AI 视频总结',
  '字幕翻译导出',
  '更高并发与优先处理',
  '后续更多能力',
]

export function ProPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <p className="text-sm font-medium tracking-[0.2em] text-accent">VIDMUSE PRO</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">更快，更省事</h1>
        <p className="mt-3 text-muted">为经常存视频的人准备。支付能力即将接入。</p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="text-sm text-muted">免费</p>
          <p className="mt-2 text-3xl font-semibold">
            ¥0<span className="text-base font-normal text-muted"> / 永久</span>
          </p>
          <ul className="mt-6 space-y-3 text-sm text-muted">
            {freeFeatures.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-ink/50">·</span>
                {f}
              </li>
            ))}
          </ul>
          <Link
            to="/"
            className="mt-8 flex h-11 items-center justify-center rounded-xl border border-line text-sm font-medium transition hover:border-muted"
          >
            继续免费使用
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-surface p-6 shadow-[0_0_40px_rgba(255,59,48,0.12)]">
          <div className="absolute right-4 top-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            推荐
          </div>
          <p className="text-sm text-muted">Pro</p>
          <p className="mt-2 text-3xl font-semibold">
            ¥19<span className="text-base font-normal text-muted"> / 月</span>
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {proFeatures.map((f) => (
              <li key={f} className="flex gap-2 text-ink/90">
                <span className="text-accent">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => alert('支付即将开放，当前为学习演示占位。')}
            className="mt-8 flex h-11 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            即将开放
          </button>
        </div>
      </div>
    </div>
  )
}
