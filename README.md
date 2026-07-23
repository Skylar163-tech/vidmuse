# VidMuse

AI 视频下载与总结助手。粘贴链接，多平台保存到本地。基于 [yt-dlp](https://github.com/yt-dlp/yt-dlp)。

> 仅供学习交流，请尊重版权与平台服务条款。

## 技术栈

- 前端：React + Vite + Tailwind CSS
- 后端：FastAPI + yt-dlp（无数据库）

## 文档

- [PROJECT_STATUS.md](PROJECT_STATUS.md) — 项目状态与已知问题
- [ARCHITECTURE.md](ARCHITECTURE.md) — 目录与 API 架构
- [.cursorrules](.cursorrules) — Cursor 开发约定

## 环境要求

- Node.js 18+
- Python 3.8+（建议 3.10+）
- **yt-dlp 可执行文件**（推荐最新官方二进制，兼容性更好）
- 可选：[ffmpeg](https://ffmpeg.org/)（合并音视频时需要）

### 安装 yt-dlp 二进制（Windows）

```powershell
mkdir apps\api\bin -Force
# 下载最新版到 apps/api/bin/yt-dlp.exe
Invoke-WebRequest -Uri https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -OutFile apps\api\bin\yt-dlp.exe
```

也可 `pip install yt-dlp`（Python 较旧时版本可能偏旧，遇到平台解析失败请改用官方二进制）。

## 启动

### 1. 后端

```bash
cd apps/api
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：<http://127.0.0.1:8000/api/health>

### 2. 前端

```bash
cd apps/web
npm install
npm run dev
```

浏览器打开：<http://127.0.0.1:5173>（已代理 `/api` → 后端）

## 功能

- 粘贴链接 → 解析元信息 → 选择清晰度 → 下载
- `/pro`：付费门面（占位）
- `/ai`：视频总结 / 字幕翻译（当前为 mock，P2 将替换为真实 AI）

## 目录

```
apps/
  api/   FastAPI + yt-dlp 封装
  web/   React SPA
```
