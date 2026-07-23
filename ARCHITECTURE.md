# ARCHITECTURE — VidMuse

本文档描述当前仓库的真实结构与实现，不包含未落地的设计。

## 目录结构

```text
free-video-downloader/
├── apps/
│   ├── api/                          # FastAPI 后端
│   │   ├── app/
│   │   │   ├── __init__.py
│   │   │   ├── main.py               # 路由、CORS、封面代理、AI mock
│   │   │   ├── models.py             # Pydantic 请求/响应模型
│   │   │   └── ytdlp_service.py      # yt-dlp 子进程封装、任务队列
│   │   ├── bin/                      # yt-dlp 官方二进制（内容 gitignore）
│   │   │   ├── .gitkeep
│   │   │   └── .gitignore
│   │   ├── temp/                     # 下载临时文件（gitignore）
│   │   │   └── .gitkeep
│   │   ├── requirements.txt
│   │   └── .venv/                    # 本地虚拟环境（gitignore）
│   └── web/                          # React + Vite SPA
│       ├── public/                   # 静态资源（favicon 等）
│       ├── src/
│       │   ├── App.tsx               # 路由表
│       │   ├── main.tsx              # 入口
│       │   ├── index.css             # Tailwind + 主题色
│       │   ├── components/
│       │   │   └── Shell.tsx         # 顶栏 / 页脚布局
│       │   ├── pages/
│       │   │   ├── HomePage.tsx      # 下载主流程
│       │   │   ├── ProPage.tsx       # Pro 门面
│       │   │   └── AiPage.tsx        # AI 占位页
│       │   └── lib/
│       │       └── api.ts            # fetch 封装与类型
│       ├── index.html
│       ├── vite.config.ts            # 开发代理 /api → :8000
│       ├── package.json
│       └── dist/                     # 构建产物（gitignore）
├── README.md                         # 启动说明
├── PROJECT_STATUS.md                 # 项目状态
├── ARCHITECTURE.md                   # 本文件
├── .cursorrules                      # Cursor 开发约定
└── .gitignore
```

## 前端架构

### 路由

[`apps/web/src/App.tsx`](apps/web/src/App.tsx) 使用 `react-router-dom`：

| 路径 | 组件 |
|---|---|
| `/` | `HomePage` |
| `/pro` | `ProPage` |
| `/ai` | `AiPage` |

外层统一包在 `Shell` 中。

### 核心模块

| 模块 | 职责 |
|---|---|
| `Shell` | 品牌、导航、版权页脚 |
| `HomePage` | 解析表单、结果卡、格式选择、下载轮询 |
| `ProPage` / `AiPage` | 付费与 AI 占位 UI |
| `lib/api.ts` | 调用后端 REST；`thumbnailUrl` / `fileUrl` 辅助 |

### 状态管理

无全局状态库。各页面用 React `useState` / `useEffect` 管理本地状态（如解析结果、`jobId`、进度）。下载进度通过定时调用 `GET /api/jobs/{id}` 轮询。

### 开发联调

[`vite.config.ts`](apps/web/vite.config.ts)：`server.proxy['/api']` → `http://127.0.0.1:8000`，前端相对路径请求即可。

## 后端架构

### API 路由清单

实现于 [`apps/api/app/main.py`](apps/api/app/main.py)：

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/api/health` | yt-dlp / ffmpeg 健康检查 |
| `POST` | `/api/parse` | 解析 URL 元信息与 formats |
| `POST` | `/api/download` | 创建下载任务 |
| `GET` | `/api/jobs/{job_id}` | 任务状态 |
| `GET` | `/api/jobs/{job_id}/file` | 完成后取文件 |
| `GET` | `/api/thumbnail` | 查询参数 `url`，代理封面 |
| `POST` | `/api/ai/summary` | AI 总结 **mock** |
| `POST` | `/api/ai/translate-subs` | 字幕翻译 **mock** |

CORS 允许：`http://localhost:5173`、`http://127.0.0.1:5173`。

### yt-dlp 封装方式

[`apps/api/app/ytdlp_service.py`](apps/api/app/ytdlp_service.py)：

1. **二进制优先级**：`apps/api/bin/yt-dlp(.exe)` → venv Scripts → `PATH` → 回退 `python -m yt_dlp`
2. **解析**：`yt-dlp --dump-json --no-playlist --no-warnings <url>`
3. **下载**：后台 `threading.Thread` 执行 `yt-dlp -f <format> -o <temp/...>`；解析 stdout 中的进度百分比
4. **任务**：进程内 `_jobs` 字典 + 锁；TTL 约 30 分钟清理；时长软限制 3 小时
5. **不修改** yt-dlp 源码，仅 CLI 封装

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
  "message": "未检测到 ffmpeg，..."
}
```

**`GET /api/thumbnail?url=<encoded>`**  
返回图片二进制，`Content-Type` 透传；失败 400/502。

## 关键设计决策

| 决策 | 原因 |
|---|---|
| React + Vite，不用 Next.js | 纯 SPA 工具页，无需 SSR / API Routes，更轻 |
| FastAPI + 子进程调 yt-dlp | 与引擎同生态；站在巨人肩膀上，不自研各站解析 |
| 无数据库 | MVP 轻量；任务短生命周期用内存即可 |
| 封面走 `/api/thumbnail` | 浏览器直链常被平台 CDN 防盗链拦截 |
| AI 先 mock | 先打通产品门面；P2 再接真实模型 |
| 中文 UI + Raycast 色板 | 目标用户与视觉约定 |

## 配置文件说明

| 文件 | 作用 |
|---|---|
| `apps/web/vite.config.ts` | 端口 5173；`/api` 代理到 FastAPI |
| `apps/web/src/index.css` | Tailwind v4 `@theme`：背景 `#0A0A0F`、表面 `#111118`、强调 `#FF3B30` 等 |
| `apps/web/package.json` | 前端依赖与脚本 |
| `apps/api/requirements.txt` | `fastapi`、`uvicorn`、`yt-dlp`、`pydantic`（运行时还用到 `requests`，随 yt-dlp 依赖安装） |
| `.gitignore` | 忽略 `.venv`、`node_modules`、`dist`、`apps/api/temp/`、`.env` 等 |
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
