# 财经日报

每天整理可核验的财经新闻，解释背后的金融/经济学知识点，并分析对国内外经济与股市的可能影响。

## 快速开始

```bash
cd finance-daily
python3 -m http.server 5173
```

浏览器打开 [http://localhost:5173](http://localhost:5173)。

## 目录

- `index.html` / `app.js` / `styles.css` — 网页前端
- `data/index.json` — 可用期次索引
- `data/daily/YYYY-MM-DD.json` — 每日简报
- `docs/DAILY_UPDATE.md` — 日更执行规范
- `scripts/run-daily-brief.mjs` — 拉取公开 RSS + MiniMax-M3 生成日报
- `.github/workflows/daily-brief.yml` — 每天北京时间 09:00 定时触发

## 日更原则

- 新闻必须带来源 URL，禁止编造
- 区分事实摘要与影响推断
- 不构成投资建议
- 定时任务回顾**前一日**新闻（见 `docs/DAILY_UPDATE.md`）

## 定时日更（GitHub Actions + MiniMax）

1. 在 [MiniMax 开放平台](https://platform.minimaxi.com/) 获取 API Key。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中新增 Secret：`MINIMAX_API_KEY`。
3. （可选）Variables：`MINIMAX_BASE_URL`（默认 `https://api.minimaxi.com/v1`）、`MINIMAX_MODEL`（默认 `MiniMax-M3`）。
4. 推送工作流后，Actions 每天 **01:00 UTC（北京时间 09:00）** 运行；也可手动 `Run workflow`。
5. 本地试跑：

```bash
export MINIMAX_API_KEY=sk-...
npm run daily
# 可选：指定期次日期
DAILY_BRIEF_DATE=2026-09-26 npm run daily
```

流程：先从 Google News / BBC / 美联储等公开 RSS 收集候选来源，再调用 MiniMax 按规范写成 JSON；脚本会校验每条 `sources.url` 必须来自候选列表。