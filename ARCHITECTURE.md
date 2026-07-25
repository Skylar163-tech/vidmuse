# ARCHITECTURE — VidMuse

本文档描述当前仓库的真实结构与实现，不包含未落地的设计。  
**产品状态与卡点以 [PROJECT_STATUS.md](PROJECT_STATUS.md) 为准。**

## 目录结构

```text
free-video-downloader/
├── apps/
│   ├── api/                          # FastAPI 后端
│   │   ├── app/
│   │   │   ├── __init__.py
│   │   │   ├── main.py               # 路由、CORS、封面代理、AI、配额
│   │   │   ├── models.py             # Pydantic 请求/响应模型
│   │   │   ├── ytdlp_service.py      # yt-dlp 子进程封装、任务队列、可选 cookies
│   │   │   ├── url_utils.py          # URL 清洗（B 站追踪参数）
│   │   │   ├── subtitle_service.py   # 字幕拉取与解析（无轨不兜底）
│   │   │   ├── deepseek_client.py    # DeepSeek API 客户端
│   │   │   ├── ai_service.py         # 总结 / 翻译编排
│   │   │   └── quota.py              # 免费 AI 日限额（内存 + Cookie）
│   │   ├── bin/                      # yt-dlp / ffmpeg 二进制（内容 gitignore）
│   │   ├── temp/                     # 下载临时文件（gitignore）
│   │   ├── cookies.txt               # 可选 Netscape cookies（gitignore，勿提交）
│   │   ├── .env.example
│   │   ├── requirements.txt
│   │   └── .venv/
│   └── web/                          # React + Vite SPA
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── index.css
│       │   ├── components/
│       │   │   └── Shell.tsx         # 顶栏 / 页脚；笔记导航带 session
│       │   ├── pages/
│       │   │   ├── HomePage.tsx      # 解析、双 CTA、清空、下载
│       │   │   ├── AiPage.tsx        # 学习笔记：本页解析、自动总结、独立翻译
│       │   │   └── ProPage.tsx       # Pro 门面（支付占位）
│       │   └── lib/
│       │       ├── api.ts            # fetch 封装与类型
│       │       └── videoSession.ts   # sessionStorage 跨页上下文
│       ├── vite.config.ts
│       └── package.json
├── README.md
├── PROJECT_STATUS.md
├── ARCHITECTURE.md
├── .cursorrules
└── .gitignore
```

## 前端架构

### 路由

[`apps/web/src/App.tsx`](apps/web/src/App.tsx) 使用 `react-router-dom`：

| 路径 | 组件 |
|---|---|
| `/` | `HomePage` |
| `/pro` | `ProPage` |
| `/ai` | `AiPage`（支持 `?url=&title=`；可本页换链） |

外层统一包在 `Shell` 中。

### 核心模块

| 模块 | 职责 |
|---|---|
| `Shell` | 品牌、导航、版权页脚；「学习笔记」优先带 session url |
| `HomePage` | 解析、双 CTA（学习笔记 / 下载）、清晰度与进度、一键清空 |
| `AiPage` | 本页「解析并开始」、自动总结、独立翻译、同页下载、日额度 |
| `ProPage` | 免费 3 次/日 vs Pro 文案；支付占位 |
| `lib/api.ts` | REST 客户端与类型（含 `credentials: 'include'`） |
| `lib/videoSession.ts` | `sessionStorage`：url / title / formats / selectedFormatId |

### 状态管理

无全局状态库。各页面用 React `useState` / `useEffect`。  
**跨页上下文**靠 `sessionStorage`（`videoSession`），不是 Redux。下载进度通过 `GET /api/jobs/{id}` 轮询。

### 开发联调

[`vite.config.ts`](apps/web/vite.config.ts)：`server.proxy['/api']` → `http://127.0.0.1:8000`，前端相对路径请求即可。

## 后端架构

### API 路由清单

实现于 [`apps/api/app/main.py`](apps/api/app/main.py)：

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/api/health` | yt-dlp / ffmpeg / deepseek 健康检查 |
| `POST` | `/api/parse` | 解析 URL 元信息与 formats |
| `POST` | `/api/download` | 创建下载任务 |
| `GET` | `/api/jobs/{job_id}` | 任务状态 |
| `GET` | `/api/jobs/{job_id}/file` | 完成后取文件 |
| `GET` | `/api/thumbnail` | 查询参数 `url`，代理封面 |
| `GET` | `/api/ai/quota` | 今日免费 AI 已用/剩余（设备 Cookie） |
| `POST` | `/api/ai/summary` | 字幕 → DeepSeek 结构化总结（成功计 1 次日限额） |
| `POST` | `/api/ai/translate-subs` | 字幕 → DeepSeek 翻译（成功计 1 次日限额） |

CORS 允许：`http://localhost:5173`、`http://127.0.0.1:5173`（`allow_credentials=True`）。

### yt-dlp 封装方式

[`apps/api/app/ytdlp_service.py`](apps/api/app/ytdlp_service.py)：

1. **二进制优先级**：`apps/api/bin/yt-dlp(.exe)` → venv Scripts → `PATH` → 回退 `python -m yt_dlp`
2. **可选 Cookie**：若存在 `YTDLP_COOKIES_FILE` 或 `apps/api/cookies.txt`，所有 `run_yt_dlp` 自动加 `--cookies`
3. **解析**：`yt-dlp --dump-json --no-playlist --no-warnings <url>`
4. **下载**：后台线程执行；TTL / 时长软限制见代码
5. **不修改** yt-dlp 源码，仅 CLI 封装

### 字幕与 AI

[`subtitle_service.py`](apps/api/app/subtitle_service.py) + [`ai_service.py`](apps/api/app/ai_service.py)：

- 拉轨：`--write-subs` / `--write-auto-subs`，语言含 `ai-zh` 等，失败再 `all`
- **无真实字幕轨则失败**，不回退标题/简介编造笔记
- 错误文案区分「无外挂轨」与「可能需登录 Cookie」
- 配额：[`quota.py`](apps/api/app/quota.py) 按日 + 设备 Cookie；成功调用后 `consume`

### 主要请求 / 响应格式

模型定义见 [`apps/api/app/models.py`](apps/api/app/models.py)。

**`POST /api/parse`**

```json
// request
{ "url": "https://..." }

// response（节选）
{
  "id": "...",
  "title": "...",
  "thumbnail": "https://...",
  "duration": 103.0,
  "uploader": "...",
  "webpage_url": "...",
  "extractor": "...",
  "formats": [
    {
      "format_id": "18",
      "ext": "mp4",
      "resolution": "640x360",
      "fps": 30,
      "vcodec": "...",
      "acodec": "...",
      "filesize": 1234567
    }
  ]
}
```

**`POST /api/download`**

```json
// request
{ "url": "https://...", "format_id": "18" }

// response
{ "job_id": "<hex>" }
```

**`GET /api/jobs/{job_id}`**

```json
{
  "job_id": "...",
  "status": "queued|running|done|error",
  "progress": 45.2,
  "error": null,
  "filename": "...",
  "title": "..."
}
```

**`GET /api/health`**

```json
{
  "ok": true,
  "yt_dlp": "2026.07.04",
  "ffmpeg": false,
  "deepseek": true,
  "message": "未检测到 ffmpeg，..."
}
```

**`GET /api/ai/quota`**

```json
{ "used": 1, "limit": 3, "remaining": 2 }
```

**`GET /api/thumbnail?url=<encoded>`**  
返回图片二进制，`Content-Type` 透传；失败 400/502。

## 关键设计决策

| 决策 | 原因 |
|---|---|
| React + Vite，不用 Next.js | 纯 SPA 工具页，无需 SSR / API Routes，更轻 |
| FastAPI + 子进程调 yt-dlp | 与引擎同生态；不自研各站解析 |
| 无数据库 | MVP 轻量；任务与日限额用内存即可 |
| 封面走 `/api/thumbnail` | 浏览器直链常被平台 CDN 防盗链拦截 |
| AI 用 DeepSeek + 平台字幕 | 真实笔记；无字幕暂不 ASR，禁止标题幻觉 |
| sessionStorage 跨页 | 修旅途断点，不上全局状态库 |
| 首页笔记主 CTA、下载次 CTA | 创作者向产品叙事，能力解耦 |
| 中文 UI + Raycast 色板 | 目标用户与视觉约定 |

## 配置文件说明

| 文件 | 作用 |
|---|---|
| `apps/web/vite.config.ts` | 端口 5173；`/api` 代理到 FastAPI |
| `apps/web/src/index.css` | Tailwind v4 `@theme`：背景 `#0A0A0F`、表面 `#111118`、强调 `#FF3B30` 等 |
| `apps/web/package.json` | 前端依赖与脚本 |
| `apps/api/requirements.txt` | `fastapi`、`uvicorn`、`yt-dlp`、`pydantic`、`openai`、`python-dotenv` |
| `apps/api/.env.example` | `DEEPSEEK_API_KEY`、可选 `DEEPSEEK_MODEL` / `FREE_AI_DAILY_LIMIT` / `YTDLP_COOKIES_FILE` |
| `.gitignore` | 忽略 `.venv`、`node_modules`、`dist`、`temp/`、`.env`、`cookies.txt` 等 |
| `apps/api/bin/.gitignore` | 忽略二进制，保留目录占位 |

## 数据流（下载）

```text
浏览器 HomePage
  → POST /api/parse
  → yt-dlp --dump-json
  → 展示 formats + GET /api/thumbnail
  → POST /api/download
  → 后台 yt-dlp 写 temp/
  → 轮询 GET /api/jobs/{id}
  → GET /api/jobs/{id}/file 触发保存
```

## 数据流（学习笔记）

```text
HomePage「生成学习笔记」或 AiPage「解析并开始」
  → sessionStorage 保存 url/formats
  → （可选）自动 POST /api/ai/summary
  → yt-dlp 拉字幕（可选 --cookies）→ 解析 VTT/SRT
  → DeepSeek 生成 summary / bullets / chapters
  → 前端展示；翻译可另调 POST /api/ai/translate-subs
  → 同页可复用 formats 下载原片
```
