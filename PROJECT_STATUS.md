# PROJECT_STATUS — VidMuse

**项目名称：** VidMuse（AI 视频下载与总结助手）  
**仓库目录：** `free-video-downloader`  
**定位：** 学习向的轻量 Web 工具——粘贴视频链接，多平台解析并下载到本地；后续扩展 AI 总结与字幕翻译。尊重版权，仅供学习交流。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite + TypeScript + Tailwind CSS + react-router-dom |
| 后端 | FastAPI + Pydantic + uvicorn |
| 下载引擎 | yt-dlp（子进程调用，优先 `apps/api/bin/yt-dlp.exe`） |
| 存储 | 无数据库；任务状态内存 dict；文件落在 `apps/api/temp/` |

## 已完成功能（P0 — 视频下载）

### 页面

| 路由 | 文件 | 能力 |
|---|---|---|
| `/` | `apps/web/src/pages/HomePage.tsx` | 粘贴链接 → 解析 → 选清晰度 → 进度条 → 触发浏览器下载；封面展示；Pro 诱饵条 |
| `/pro` | `apps/web/src/pages/ProPage.tsx` | 免费 / Pro 定价门面；「即将开放」占位 CTA |
| `/ai` | `apps/web/src/pages/AiPage.tsx` | 视频总结 / 字幕翻译面板（当前调用 mock 接口） |

布局与导航：`apps/web/src/components/Shell.tsx`（品牌、导航、版权页脚）。

### 后端接口

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/api/health` | 检测 yt-dlp 版本与 ffmpeg 是否在 PATH |
| `POST` | `/api/parse` | 解析视频元信息与可选格式列表 |
| `POST` | `/api/download` | 创建下载任务，返回 `job_id` |
| `GET` | `/api/jobs/{job_id}` | 查询任务状态与进度 |
| `GET` | `/api/jobs/{job_id}/file` | 下载完成后流式返回文件 |
| `GET` | `/api/thumbnail?url=` | 代理封面图（绕过防盗链） |

### 能力摘要

- 基于 yt-dlp 的多平台解析与下载（站点能力随 yt-dlp 版本变化）
- 清晰度列表选择、后台线程下载、前端轮询进度
- 封面经后端代理展示（小红书等 CDN 友好）
- Raycast 风格深色 UI（中文为主）
- 页脚版权与 yt-dlp 致谢提示

## 半成品（占位，非真实能力）

| 项 | 说明 |
|---|---|
| `POST /api/ai/summary` | 返回固定演示总结文案，`pro_required: true` |
| `POST /api/ai/translate-subs` | 返回固定双语字幕片段 |
| `/pro` 支付 | `alert` 占位，无真实支付 |

## 未完成功能（P2 — 真实 AI）

- 真实视频总结（接入模型 / 字幕管道，替换 mock）
- 真实字幕提取与翻译
- 批量下载等 Pro 承诺能力的实装

## 已知问题及处理

### B 站分享链接带追踪参数

**现象：** B 站分享 URL 常带 `spm_id_from`、`trackId` 等查询参数，可能导致解析异常。

**处理：** 使用前精简为纯视频 URL，例如只保留：

```text
https://www.bilibili.com/video/BVxxxxxxxxxx
```

（本次未在代码中做自动清洗，依赖用户粘贴干净链接。）

## 运行环境要求

- Node.js 18+
- Python 3.8+（建议 3.10+）
- 推荐将最新 [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) 二进制放到 `apps/api/bin/yt-dlp.exe`（Windows）
- 可选：本机安装 ffmpeg，并保证在 `PATH` 中（合并部分音视频格式时需要）

### 启动

```bash
# 后端
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 前端（另开终端）
cd apps/web
npm install
npm run dev
```

- 前端：http://127.0.0.1:5173（Vite 将 `/api` 代理到后端）
- 健康检查：http://127.0.0.1:8000/api/health

更完整说明见根目录 [README.md](README.md)。
