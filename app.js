const statusEl = document.getElementById("status");
const itemsEl = document.getElementById("items");
const selectEl = document.getElementById("edition-select");
const heroDateEl = document.getElementById("hero-date");
const disclaimerEl = document.getElementById("disclaimer");
const generatedAtEl = document.getElementById("generated-at");

function formatDateZh(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日 · 星期${weekday}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderConcepts(concepts = []) {
  if (!concepts.length) return "";
  const rows = concepts
    .map(
      (c) => `
      <div>
        <dt>${escapeHtml(c.term)}</dt>
        <dd>${escapeHtml(c.explanation)}</dd>
      </div>`
    )
    .join("");
  return `
    <div class="panel">
      <h3>知识点</h3>
      <dl class="concepts">${rows}</dl>
    </div>`;
}

function renderImpacts(impacts = {}) {
  const blocks = [
    ["国内经济", impacts.domesticEconomy],
    ["国际经济", impacts.globalEconomy],
    ["市场影响", impacts.markets],
  ]
    .filter(([, text]) => text)
    .map(
      ([label, text]) => `
      <div class="impact">
        <h3>${label}</h3>
        <p>${escapeHtml(text)}</p>
      </div>`
    )
    .join("");

  if (!blocks) return "";
  return `<div class="impact-grid">${blocks}</div>`;
}

function renderSources(sources = []) {
  if (!sources.length) {
    return `<div class="sources"><h3>来源</h3><p>缺少可核验来源，本条不应展示。</p></div>`;
  }
  const list = sources
    .map((s) => {
      const title = escapeHtml(s.title || s.url);
      const publisher = escapeHtml(s.publisher || "来源");
      const publishedAt = s.publishedAt ? escapeHtml(s.publishedAt) : "";
      const href = escapeHtml(s.url);
      return `
        <li>
          <a href="${href}" target="_blank" rel="noopener noreferrer">${title}</a>
          <span class="source-meta">${publisher}${publishedAt ? ` · ${publishedAt}` : ""}</span>
        </li>`;
    })
    .join("");
  return `
    <div class="sources">
      <h3>来源说明</h3>
      <ul>${list}</ul>
    </div>`;
}

function renderEdition(data) {
  heroDateEl.textContent = formatDateZh(data.date);
  disclaimerEl.textContent = data.disclaimer || "";
  generatedAtEl.textContent = data.generatedAt
    ? `生成时间：${data.generatedAt}`
    : "";

  if (data.notes) {
    statusEl.className = "notes";
    statusEl.textContent = data.notes;
  } else {
    statusEl.textContent = "";
    statusEl.className = "status";
  }

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    statusEl.className = "status error";
    statusEl.textContent = "本日暂无已核验条目。";
    itemsEl.innerHTML = "";
    return;
  }

  itemsEl.innerHTML = items
    .map((item, index) => {
      const n = String(index + 1).padStart(2, "0");
      return `
        <li class="item" id="${escapeHtml(item.id || `item-${n}`)}">
          <span class="item-index">NO. ${n}</span>
          <h2>${escapeHtml(item.headline)}</h2>
          <p class="summary">${escapeHtml(item.summary)}</p>
          ${renderConcepts(item.concepts)}
          ${renderImpacts(item.impacts)}
          ${renderSources(item.sources)}
        </li>`;
    })
    .join("");
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`无法加载 ${path}`);
  return res.json();
}

async function loadEdition(date) {
  statusEl.className = "status";
  statusEl.textContent = "正在加载…";
  itemsEl.innerHTML = "";
  try {
    const data = await fetchJson(`./data/daily/${date}.json`);
    renderEdition(data);
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = `加载失败：${err.message}`;
  }
}

async function boot() {
  try {
    const index = await fetchJson("./data/index.json");
    const editions = Array.isArray(index.editions) ? index.editions : [];
    const latest = index.latest || editions[0];

    selectEl.innerHTML = editions
      .map(
        (d) =>
          `<option value="${escapeHtml(d)}"${d === latest ? " selected" : ""}>${escapeHtml(d)}</option>`
      )
      .join("");

    selectEl.addEventListener("change", () => {
      loadEdition(selectEl.value);
    });

    if (!latest) {
      statusEl.className = "status error";
      statusEl.textContent = "尚无日报数据。";
      return;
    }

    await loadEdition(latest);
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = `初始化失败：${err.message}`;
  }
}

boot();
