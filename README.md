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
- `docs/DAILY_UPDATE.md` — Cursor 定时自动化执行规范

## 日更原则

- 新闻必须带来源 URL，禁止编造
- 区分事实摘要与影响推断
- 不构成投资建议

日更由 Cursor 定时自动化按 `docs/DAILY_UPDATE.md` 执行。
