/**
 * Generate yesterday's finance daily brief via MiniMax-M3.
 * Sources come from public RSS feeds; the model only structures verified candidates.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MODEL = "MiniMax-M3";
const DISCLAIMER =
  "本页解读基于公开报道整理，不构成投资建议。知识点为一般性经济学说明；影响分析属基于公开信息的合理推断，可能与实际走势不符。";

function shanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function shanghaiYesterdayYmd() {
  const { y, m, d } = shanghaiParts();
  const yesterday = new Date(Date.UTC(y, m - 1, d));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

function nowShanghaiIso() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripTags(html) {
  return decodeXml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml, feedLabel) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const link =
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ||
      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1];
    const pubDate = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1];
    const description = block.match(
      /<description[^>]*>([\s\S]*?)<\/description>/i,
    )?.[1];
    const source =
      block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || feedLabel;
    if (!title || !link) continue;
    items.push({
      title: stripTags(title),
      url: stripTags(link),
      publishedAt: pubDate ? stripTags(pubDate) : "",
      snippet: stripTags(description || "").slice(0, 400),
      publisher: stripTags(source),
      feed: feedLabel,
    });
  }
  return items;
}

function sameShanghaiDay(dateLike, editionDate) {
  if (!dateLike) return true;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) {
    return dateLike.includes(editionDate);
  }
  const { y, m, day } = (() => {
    const p = shanghaiParts(d);
    return { y: p.y, m: p.m, day: p.d };
  })();
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return ymd === editionDate;
}

function feedUrls(editionDate) {
  const qZh = encodeURIComponent(
    `财经 OR 央行 OR 宏观 OR 股市 when:${editionDate}`,
  );
  const qEn = encodeURIComponent(
    `Federal Reserve OR inflation OR economy OR markets when:${editionDate}`,
  );
  return [
    {
      label: "Google News CN",
      url: `https://news.google.com/rss/search?q=${qZh}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
      // when: already scopes the query; skip strict pubDate filter
      skipDateFilter: true,
    },
    {
      label: "Google News US",
      url: `https://news.google.com/rss/search?q=${qEn}&hl=en-US&gl=US&ceid=US:en`,
      skipDateFilter: true,
    },
    {
      label: "BBC Business",
      url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    },
    {
      label: "CNBC Top News",
      url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    },
    {
      label: "Federal Reserve",
      url: "https://www.federalreserve.gov/feeds/press_all.xml",
    },
  ];
}

async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "finance-daily-bot/1.0 (+https://github.com/Arantxa1025/finance-daily)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function collectCandidates(editionDate) {
  const collected = [];
  const seen = new Set();
  for (const feed of feedUrls(editionDate)) {
    try {
      const xml = await fetchText(feed.url);
      const items = parseRssItems(xml, feed.label).filter((item) =>
        feed.skipDateFilter
          ? true
          : sameShanghaiDay(item.publishedAt, editionDate),
      );
      for (const item of items) {
        const key = item.url;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(item);
      }
      console.log(`feed ok: ${feed.label} (+${items.length})`);
    } catch (err) {
      console.warn(`feed fail: ${feed.label}: ${err.message}`);
    }
  }
  return collected.slice(0, 40);
}

function extractJsonObject(text) {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("model response did not contain a JSON object");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callMiniMax({ apiKey, baseUrl, model, messages }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_completion_tokens: 8192,
      thinking: { type: "disabled" },
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`MiniMax HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = JSON.parse(body);
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("MiniMax response missing choices[0].message.content");
  }
  return content;
}

function buildPrompt(editionDate, candidates) {
  return `你是财经日报编辑。只能根据下方「候选来源」整理日报，禁止编造新闻、数据和 URL。

期次日期（Asia/Shanghai）：${editionDate}
输出：仅输出一个合法 JSON 对象（不要 Markdown），结构必须符合：
{
  "date": "${editionDate}",
  "timezone": "Asia/Shanghai",
  "title": "财经日报",
  "generatedAt": "ISO-8601+08:00",
  "disclaimer": "${DISCLAIMER}",
  "items": [ { "id":"${editionDate}-01", "headline","summary","concepts":[{"term","explanation"}], "impacts":{"domesticEconomy","globalEconomy","markets"}, "sources":[{"publisher","title","url","publishedAt"}] } ],
  "notes": "可选；可核验不足 3 条时必填"
}

硬性规则：
1. 选取 3–6 条；若候选不足 3 条可核验新闻，items 只放已核验条目并写 notes，绝不虚构凑数。
2. 每条 sources.url 必须原样复制自候选列表，不得改写、拼接或臆造。
3. summary 只写事实；impacts 用“可能/或将/市场关注”等措辞；禁止买入/卖出等投资建议。
4. 每条 1–2 个 concepts；语言简体中文。
5. 优先宏观政策、央行、就业通胀、重要监管/财报、大宗商品/汇率等有广泛影响的条目。

候选来源（JSON 数组）：
${JSON.stringify(candidates, null, 2)}`;
}

function validateBrief(brief, editionDate, candidates) {
  const allowed = new Set(candidates.map((c) => c.url));
  if (brief.date !== editionDate) {
    throw new Error(`date mismatch: ${brief.date} !== ${editionDate}`);
  }
  if (!Array.isArray(brief.items)) {
    throw new Error("items must be an array");
  }
  for (const [i, item] of brief.items.entries()) {
    if (!item?.sources?.length) {
      throw new Error(`item ${i} missing sources`);
    }
    for (const src of item.sources) {
      if (!allowed.has(src.url)) {
        throw new Error(`item ${i} has unknown url: ${src.url}`);
      }
    }
  }
  brief.timezone = "Asia/Shanghai";
  brief.title = "财经日报";
  brief.disclaimer = DISCLAIMER;
  brief.generatedAt = nowShanghaiIso();
  brief.items = brief.items.map((item, idx) => ({
    ...item,
    id: `${editionDate}-${String(idx + 1).padStart(2, "0")}`,
  }));
  if (brief.items.length < 3) {
    brief.notes =
      brief.notes ||
      `今日可核验来源不足，仅收录 ${brief.items.length} 条。`;
  }
  return brief;
}

async function updateIndex(editionDate) {
  const indexPath = path.join(ROOT, "data", "index.json");
  let index = { latest: editionDate, editions: [] };
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch {
    // fresh index
  }
  const editions = [
    editionDate,
    ...(index.editions || []).filter((d) => d !== editionDate),
  ].slice(0, 30);
  const next = { latest: editionDate, editions };
  await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function main() {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) {
    console.error("MINIMAX_API_KEY is required");
    process.exit(1);
  }

  const baseUrl = (
    process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const model = process.env.MINIMAX_MODEL || DEFAULT_MODEL;
  const editionDate =
    process.env.DAILY_BRIEF_DATE?.trim() || shanghaiYesterdayYmd();

  console.log(
    JSON.stringify({ editionDate, baseUrl, model, root: ROOT }, null, 2),
  );

  const candidates = await collectCandidates(editionDate);
  console.log(`candidates: ${candidates.length}`);

  let brief;
  if (candidates.length === 0) {
    brief = {
      date: editionDate,
      timezone: "Asia/Shanghai",
      title: "财经日报",
      generatedAt: nowShanghaiIso(),
      disclaimer: DISCLAIMER,
      items: [],
      notes: "今日可核验来源不足，仅收录 0 条。",
    };
  } else {
    const content = await callMiniMax({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content:
            "你只输出合法 JSON。不得编造新闻、数据或 URL。不得输出投资建议。",
        },
        { role: "user", content: buildPrompt(editionDate, candidates) },
      ],
    });
    brief = validateBrief(extractJsonObject(content), editionDate, candidates);
  }

  const dailyDir = path.join(ROOT, "data", "daily");
  await mkdir(dailyDir, { recursive: true });
  const dailyPath = path.join(dailyDir, `${editionDate}.json`);
  await writeFile(dailyPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  await updateIndex(editionDate);

  console.log(
    JSON.stringify(
      {
        wrote: path.relative(ROOT, dailyPath),
        itemCount: brief.items.length,
        notes: brief.notes || null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});