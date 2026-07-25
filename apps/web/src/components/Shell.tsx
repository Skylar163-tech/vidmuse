import type { MouseEvent, ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { loadSession, notesPathFromSession } from '../lib/videoSession'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  function goNotes(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    const session = loadSession()
    if (session?.url) {
      navigate(notesPathFromSession(session))
    } else {
      navigate('/ai')
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link to="/" className="group flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-[0_0_24px_rgba(255,59,48,0.45)] transition group-hover:bg-accent-hover">
            M
          </span>
          <span className="text-lg font-semibold tracking-tight">VidMuse</span>
        </Link>
        <nav className="flex items-center gap-5">
          <NavLink to="/" end className={linkClass}>
            首页
          </NavLink>
          <NavLink
            to="/ai"
            onClick={goNotes}
            className={linkClass}
          >
            学习笔记
          </NavLink>
          <NavLink
            to="/pro"
            className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            Pro
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-line pt-6 text-center text-xs leading-relaxed text-muted">
        <p>仅供学习交流，请尊重版权与平台服务条款。勿用于侵权传播。</p>
        <p className="mt-1">
          下载引擎基于开源项目{' '}
          <a
            className="text-ink/80 underline-offset-2 hover:underline"
            href="https://github.com/yt-dlp/yt-dlp"
            target="_blank"
            rel="noreferrer"
          >
            yt-dlp
          </a>
        </p>
      </footer>
    </div>
  )
}
