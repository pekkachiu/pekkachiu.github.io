/**
 * 部落格前端互動：日夜切換、歸檔頁的分類篩選與標籤。
 * 純函式放在上半部，Node 測試（tests/blog-ui.test.js）直接 require 這支檔案。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.init(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const THEME_KEY = "blog-theme";
  const THEMES = ["light", "dark"];
  const ALL = null;
  const LABEL_ALL = "全部";
  const META_URL = "/post-meta.json";

  // ---------- 純函式 ----------

  function resolveTheme(stored, prefersDark) {
    if (THEMES.includes(stored)) return stored;
    return prefersDark ? "dark" : "light";
  }

  function nextTheme(current) {
    return current === "dark" ? "light" : "dark";
  }

  function collectCategories(meta) {
    const counts = new Map();
    for (const entry of Object.values(meta)) {
      for (const name of entry.categories)
        counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function matchesCategory(entry, category) {
    if (category === ALL) return true;
    return Boolean(entry && entry.categories.includes(category));
  }

  /** HTML 裡的中文網址是百分比編碼，post-meta.json 的 key 是原文，查詢前先解碼 */
  function metaFor(meta, href) {
    if (!href) return undefined;
    try {
      return meta[decodeURI(href)];
    } catch (e) {
      return undefined;
    }
  }

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${m[1]}.${m[2]}.${m[3]}` : "";
  }

  // ---------- DOM ----------

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* 無痕模式等情況存不了，只影響下次預設值 */
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setupThemeToggle(win) {
    const doc = win.document;
    const target = doc.querySelector(".header");
    if (!target) return;
    const button = el("button", "theme-toggle");
    button.type = "button";
    const render = () => {
      const isDark = doc.documentElement.dataset.theme === "dark";
      button.innerHTML = isDark
        ? '<i class="fa fa-sun"></i>'
        : '<i class="fa fa-moon"></i>';
      button.setAttribute(
        "aria-label",
        isDark ? "切換為淺色模式" : "切換為深色模式",
      );
    };
    button.addEventListener("click", () => {
      const theme = nextTheme(doc.documentElement.dataset.theme);
      doc.documentElement.dataset.theme = theme;
      storeTheme(theme);
      render();
    });
    render();
    target.appendChild(button);
  }

  async function fetchMeta(win) {
    try {
      const res = await win.fetch(META_URL);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function decorateArticle(article, entry) {
    const time = article.querySelector("time");
    if (time) time.textContent = formatDate(time.getAttribute("datetime"));
    if (!entry) return;
    const chips = el("div", "archive-chips");
    for (const name of entry.categories)
      chips.appendChild(el("span", "archive-chip archive-chip-category", name));
    for (const name of entry.tags)
      chips.appendChild(el("span", "archive-chip", "#" + name));
    article.querySelector(".post-header").appendChild(chips);
  }

  /** 年份前面加圓形徽章（年份末兩碼），數量改成「N 篇」 */
  function decorateYear(year) {
    const header = year.querySelector(".collection-header");
    if (!header) return;
    const count = header.querySelector(".collection-year-count");
    const label = header.firstChild ? header.firstChild.textContent.trim() : "";
    header.prepend(el("span", "year-badge", label.slice(-2)));
    if (count) count.textContent = count.textContent.trim() + " 篇";
  }

  function applyFilter(container, meta, category) {
    for (const article of container.querySelectorAll("article")) {
      const link = article.querySelector(".post-title-link");
      const entry = link && metaFor(meta, link.getAttribute("href"));
      article.hidden = !matchesCategory(entry, category);
    }
    // 該年份底下沒有符合的文章，就把年份也藏起來
    for (const year of container.querySelectorAll(".collection-year")) {
      let next = year.nextElementSibling;
      let visible = false;
      while (next && next.tagName === "ARTICLE") {
        if (!next.hidden) visible = true;
        next = next.nextElementSibling;
      }
      year.hidden = !visible;
    }
  }

  function buildFilterBar(container, meta) {
    const categories = collectCategories(meta);
    const bar = el("div", "archive-filter");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "依分類篩選");
    const options = [{ name: ALL, label: LABEL_ALL }].concat(
      categories.map((c) => ({ name: c.name, label: c.name })),
    );
    const buttons = options.map((option) => {
      const button = el("button", "archive-filter-pill", option.label);
      button.type = "button";
      button.addEventListener("click", () => {
        for (const b of buttons)
          b.setAttribute("aria-pressed", String(b === button));
        applyFilter(container, meta, option.name);
      });
      button.setAttribute("aria-pressed", String(option.name === ALL));
      bar.appendChild(button);
      return button;
    });
    return bar;
  }

  async function setupArchive(win) {
    const container = win.document.querySelector(".archive .post-content");
    if (!container) return;
    const meta = await fetchMeta(win);
    // 抓不到資料時保留 NexT 原本的歸檔清單，只是沒有篩選與標籤
    if (!meta) return;
    for (const article of container.querySelectorAll("article")) {
      const link = article.querySelector(".post-title-link");
      decorateArticle(article, link && metaFor(meta, link.getAttribute("href")));
    }
    for (const year of container.querySelectorAll(".collection-year"))
      decorateYear(year);
    const title = container.querySelector(".collection-title");
    const heading = el("h1", "archive-heading", "歸檔");
    const bar = buildFilterBar(container, meta);
    if (title) title.replaceWith(heading);
    else container.prepend(heading);
    heading.after(bar);
  }

  function init(win) {
    const run = () => {
      setupThemeToggle(win);
      setupArchive(win);
    };
    if (win.document.readyState === "loading")
      win.document.addEventListener("DOMContentLoaded", run);
    else run();
  }

  return {
    THEME_KEY,
    resolveTheme,
    nextTheme,
    collectCategories,
    matchesCategory,
    metaFor,
    formatDate,
    init,
  };
});
