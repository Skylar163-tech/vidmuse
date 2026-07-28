# VidMuse

AI 视频学习助手：粘贴链接，生成可复用的创作/学习笔记；需要精看或二创时再下载原片。基于 [yt-dlp](https://github.com/yt-dlp/yt-dlp) + DeepSeek。

> 仅供学习交流，请尊重版权与平台服务条款。

## 技术栈

- 前端：React + Vite + Tailwind CSS
- 后端：FastAPI + yt-dlp + DeepSeek API（无数据库）

## 文档

- [PROJECT_STATUS.md](PROJECT_STATUS.md) — **当前功能、卡点与验收清单（状态源）**
- [ARCHITECTURE.md](ARCHITECTURE.md) — 目录与 API 架构
- [.cursorrules](.cursorrules) — Cursor 开发约定

## 环境要求

- Node.js 18+
- Python 3.8+（建议 3.10+）
- **yt-dlp 可执行文件**（推荐最新官方二进制）
- 可选：[ffmpeg](https://ffmpeg.org/)（**强烈建议**：B站等站点音视频分离，无 ffmpeg 下载会无声）

### 安装 ffmpeg（Windows，推荐）

1. 打开 https://www.gyan.dev/ffmpeg/builds/ 下载 `ffmpeg-release-essentials.zip`
2. 解压后，把其中的 `bin\ffmpeg.exe`（建议同时复制 `ffprobe.exe`）放到：

```text
apps\api\bin\ffmpeg.exe
```

3. 重启后端，打开 `/api/health`，确认 `ffmpeg: true`

也可自行安装到系统 PATH，后端同样能检测到。

- **DeepSeek API Key**（学习笔记 / 字幕翻译需要）

### 安装 yt-dlp 二进制（Windows）

```powershell
mkdir apps\api\bin -Force
Invoke-WebRequest -Uri https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -OutFile apps\api\bin\yt-dlp.exe
```

### 配置 DeepSeek

```powershell
cd apps\api
copy .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY=sk-...
```

在 [DeepSeek 开放平台](https://platform.deepseek.com/) 申请 Key。默认模型为 `deepseek-v4-flash`，可用 `DEEPSEEK_MODEL` 覆盖。

### 可选：B 站字幕 Cookie

很多 B 站稿件的 CC / AI 字幕需要登录态才能被 yt-dlp 拉到。将浏览器导出的 **Netscape** 格式 cookies 放到：

```text
apps/api/cookies.txt
```

或在 `.env` 中设置 `YTDLP_COOKIES_FILE=绝对路径`，然后重启后端。勿提交 cookies 到仓库。

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

健康检查：<http://127.0.0.1:8000/api/health>（含 `deepseek` 是否已配置）

### 2. 前端

```bash
cd apps/web
npm install
npm run dev
```

浏览器打开：<http://127.0.0.1:5173>（已代理 `/api` → 后端）

## 功能

- 粘贴链接 → 解析 → **生成学习笔记**（需真实字幕，进入笔记页自动生成）或 **下载到本地**
- 首页支持 **清空** 当前结果与 session
- `/ai`：可本页换链接「解析并开始」；总结与翻译互不阻塞；可同页下载；免费每日 3 次 AI
- `/pro`：付费门面（占位）；讲清免费额度 vs Pro

无外挂字幕轨时笔记会明确失败（本轮不做 Whisper）。可用带 CC/自动字幕的 **YouTube** 链接验证学习笔记（无需登录）；B 站 CC/AI 字幕常需登录态，开发者可本机配置 cookies，产品不要求终端用户填写。有声下载依赖 ffmpeg。

完整能力与卡点见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。
