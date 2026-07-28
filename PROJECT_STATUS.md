# PROJECT_STATUS — VidMuse

**更新日期：** 2026-07-28  
**项目名称：** VidMuse（AI 视频学习助手）  
**仓库目录：** `vidmuse`  

**定位：** 面向创作者与知识工作者（主）/ 职场自学（次）——粘贴视频链接，生成结构化创作/学习笔记；需要精看或二创时再下载原片。尊重版权，仅供学习交流。

---

## 阶段结论（当前快照）

| 维度 | 结论 |
|---|---|
| **已完成** | 解析/下载闭环；本机 **ffmpeg** 有声合并；清晰度标签「有声（自动合并）」；学习笔记（字幕 → DeepSeek）；**YouTube 无登录正向验收**（人工 CC + 自动字幕）；`sessionStorage` 不断链；笔记页可换链；总结/翻译解耦；免费日限额 3 次；无字幕诚实失败；开发者可选 B 站 cookies |
| **主卡点** | **B 站** CC/AI 字幕平台侧常需登录态；产品**不收集用户 Cookie**；**无 Whisper/ASR**（后置） |
| **明确不做（现阶段）** | Whisper/ASR、流式 SSE、账号库、真实支付、改 yt-dlp 源码、标题/文案幻觉总结、让终端用户自填平台 cookies |

**主用户旅途：**  
`粘贴链接 → 解析 → 学习笔记（自动总结，可本页换链） ↔ 同会话下载原片；翻译可独立使用`

**本轮关键验收：**  
YouTube（未登录、自带人工 CC + 自动字幕）→ 学习笔记/总结已通：https://www.youtube.com/watch?v=FfgT6zx4k3Q  

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite + TypeScript + Tailwind + react-router-dom |
| 后端 | FastAPI + Pydantic + uvicorn |
| 下载 | yt-dlp 子进程（优先 `apps/api/bin/yt-dlp.exe`，否则 `.venv` / PATH） |
| AI | DeepSeek API（OpenAI SDK，`deepseek-v4-flash`，关闭 thinking） |
| 存储 | 无数据库；任务内存 dict；文件在 `apps/api/temp/`；AI 日限额内存计数 |

---

## 已实现功能

### 产品与前端

| 能力 | 说明 |
|---|---|
| 首页解析 | 粘贴链接 → 封面/标题/时长/清晰度；**清空**一键清结果与 session |
| 双 CTA | **主：** 生成学习笔记（写入 session 后进 `/ai` 并自动总结）；**次：** 下载到本地 |
| Session | `sessionStorage` 保存 url/title/formats，跨首页与笔记页不断链 |
| 学习笔记页 | 本页搜索框「解析并开始」；带 url 自动总结；翻译可独立点击；同页下载；日额度展示 |
| 清晰度文案 | 有 ffmpeg 时 DASH 仅视频轨标「有声（自动合并）」；不再误标「无声」 |
| Pro 页 | 文案区分免费每日 3 次 AI vs Pro；支付仍占位 |
| 文案叙事 | 创作者向（创作笔记优先，下载增强） |

### 后端能力

| 能力 | 说明 |
|---|---|
| 解析 / 下载 / 进度 / 取文件 | 完整闭环；有 ffmpeg 时 `format_id+bestaudio` 合并 |
| 封面代理 | 绕过平台 CDN 防盗链 |
| URL 清洗 | B 站去追踪参数；小红书保留 `xsec_token` 等 |
| AI 总结 | **仅真实字幕**；放宽语言码（含 ai-zh）；可选开发者 `cookies.txt`；无轨时诊断文案 |
| AI 翻译 | 需真实字幕；与总结独立；成功各计 1 次日限额；默认译前约 80 条 |
| AI 日限额 | 非会员每日 3 次（总结+翻译合计）；Cookie `vidmuse_did`；`GET /api/ai/quota` |
| yt-dlp Cookie | `YTDLP_COOKIES_FILE` 或 `apps/api/cookies.txt`（**开发者本机**调试 B 站用；非产品路径） |
| 健康检查 | 报告 yt-dlp / ffmpeg / deepseek 是否就绪 |

### 关键文件

```text
apps/api/app/
  main.py, models.py, ytdlp_service.py, quota.py
  url_utils.py, subtitle_service.py, deepseek_client.py, ai_service.py
apps/web/src/
  pages/HomePage.tsx, AiPage.tsx, ProPage.tsx
  lib/api.ts, lib/videoSession.ts
  components/Shell.tsx
```

---

## 当前卡点（按优先级）

### P0 — 有声下载（本机已解决）

| 卡点 | 现状 | 影响 |
|---|---|---|
| ffmpeg | 本机已放 `apps/api/bin/ffmpeg.exe`（+ ffprobe），有声下载已验收 | 新环境仍需自行放置；勿提交 exe |
| 安装门槛 | gyan.dev 等国外源国内常打不开 | 可用国内镜像 / BtbN 包 |

### P1 — AI 能力边界

| 卡点 | 现状 | 影响 |
|---|---|---|
| **B 站字幕登录墙** | 平台常要求登录才暴露 CC/AI 轨；产品不收集用户 Cookie | 无 cookies 时 B 站笔记常失败；YouTube 有公开 CC/自动字幕时可无登录验收 |
| **无 Whisper / ASR** | 本阶段不做 | 无外挂轨 / 仅烧录字幕仍失败；产品向兜底后置 |
| 超长内容截断 | 送模型约 24k 字符 | 长视频笔记可能不完整（`truncated: true`） |
| 翻译有条数上限 | 默认前 80 条 | 长字幕不能一次全译 |
| 小红书解析依赖完整链接 | 缺 `xsec_token` 等可能「No video formats」 | 需用首页解析成功的完整 URL 再做 AI |
| 日限额可被清 Cookie 绕过 | 学习向匿名计数 | 可接受；正式防刷需账号 |

### P2 — 产品后置（未做）

- Whisper / ASR（字幕失败时语音转写）
- 流式输出（SSE，跑通后再补，不接 LangChain）
- 思维导图、AI 多轮追问、Notion 等笔记同步  
- 真实支付 / 批量下载 / Pro 配额解锁  
- 浏览器扩展、多端  

### 环境与运维注意

| 项 | 状态（本机快照 2026-07-28） |
|---|---|
| yt-dlp | `.venv` 中可用；亦可放 `apps/api/bin/yt-dlp.exe` |
| ffmpeg | **本机已就绪**（`apps/api/bin/`，勿提交） |
| DeepSeek `.env` | 本地配置（勿提交仓库） |
| B 站 cookies | 可选、仅开发者本机；产品不要求终端用户填写 |
| 前后端需同时启动 | `:8000` + `:5173` |

---

## 已知问题（已处理或可规避）

| 问题 | 处理 |
|---|---|
| B 站分享链接带 `spm_id_from` 等 | `normalize_url()` 精简为纯 BV 链接 |
| DeepSeek V4 默认 thinking 导致 `content` 为空 | `extra_body={"thinking":{"type":"disabled"}}` |
| 控制台 400 + 5173 | 5173 是前端端口；400 多为业务错误（无字幕等），不是代理挂了 |
| 无字幕时总结「像真的但无关」 | **已改为明确失败**，不再用标题/文案兜底 |
| 解析→笔记二次点击 / 下载丢链接 | **已用 session + 自动总结 + 笔记页下载** |
| B 站「有字幕却报无」 | 放宽 `sub-langs` + 可选开发者 cookies；文案区分无轨 / 需登录 |
| DASH 仅视频轨误标「无声」 | **已修**：有 ffmpeg 时标「有声（自动合并）」；前端不再按 acodec 追加无声 |
| 笔记页无法换链 / 翻译被总结锁死 | **本页解析 + loading 解耦** |
| `??` 与 `\|\|` 混用导致 Vite 解析失败 | AiPage 已加括号修复 |

---

## 下一步建议（非实现承诺）

1. （可选）开发者本机配置 **`apps/api/cookies.txt`**，复测有 CC 的 B 站片  
2. 产品向：字幕失败后的 **ASR 兜底**（不强迫用户填 Cookie）  
3. 再后：流式输出 / 真实支付 / Pro  

---

## 验收时建议自测清单

1. `/api/health`：`yt_dlp` / `deepseek` / **`ffmpeg`**；`/api/ai/quota` 显示剩余次数  
2. **YouTube 正向（推荐，无需 cookies）**：带 CC/自动字幕的链接 → 首页或 `/ai`「解析并开始」→ 出学习笔记（例：`https://www.youtube.com/watch?v=FfgT6zx4k3Q`）  
3. （可选）B 站有字幕片 + 开发者 cookies：同上应出结果；无 cookies 时诚实失败  
4. 笔记页「解析并开始」可换新链；总结进行中仍可点「翻译」  
5. 首页「清空」后无残留卡片/session  
6. 无轨片：明确报错，不出现编造笔记  
7. 第 4 次成功 AI（限额 3）应 429 并引导 Pro  
8. B 站有声下载：清晰度含「有声（自动合并）」，下载文件有声  

---

## 启动（精简）

```powershell
# 后端
cd apps\api
.\.venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 前端（另开终端）
cd apps\web
npm run dev
```

浏览器：http://127.0.0.1:5173  

更细说明见 [README.md](README.md)、[ARCHITECTURE.md](ARCHITECTURE.md)。
