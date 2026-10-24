const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const form = $("#research-form");
const topicInput = $("#topic");
const submitBtn = $("#submit-btn");
const progressPanel = $("#progress");
const resultsSection = $("#results");
const errorBox = $("#error");
const progressBar = $("#progress-bar");

const STORAGE_KEYS = { history: "researchlab.history", saved: "researchlab.saved", collections: "researchlab.collections" };
function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
let historyItems = readStorage(STORAGE_KEYS.history, []);
let savedIds = new Set(readStorage(STORAGE_KEYS.saved, []));
let collectionNames = readStorage(STORAGE_KEYS.collections, []);
function persistData() {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(historyItems));
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify([...savedIds]));
    localStorage.setItem(STORAGE_KEYS.collections, JSON.stringify(collectionNames));
  } catch {
    showError("Browser storage is full or unavailable. Your latest changes may not persist.");
  }
}
let currentReport = null;
let elapsedTimer = null;
let stageTimers = [];

function escapeText(value) {
  return String(value ?? "");
}

function setView(name, label = name[0].toUpperCase() + name.slice(1)) {
  $$(".view").forEach(view => view.classList.add("hidden"));
  const viewId = {
    home: "home-view",
    new: "home-view",
    history: "history-view",
    saved: "saved-view",
    settings: "settings-view",
    collection: "collection-view"
  }[name] || "home-view";
  $("#" + viewId).classList.remove("hidden");
  $("#breadcrumb-current").textContent = label;
  $$(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === (name === "new" ? "home" : name)));
  if (name === "new") {
    topicInput.focus();
    $(".main-content").scrollTo({ top: 0, behavior: "smooth" });
  }
  if (name === "history") renderList("#history-list", historyItems, false);
  if (name === "saved") renderList("#saved-list", historyItems.filter(item => savedIds.has(item.id)), true);
}

function renderCollections() {
  const container = $("#collections");
  container.querySelectorAll("[data-custom-collection]").forEach(node => node.remove());
  collectionNames.forEach(name => {
    const button = document.createElement("button");
    button.className = "collection";
    button.dataset.collection = name;
    button.dataset.customCollection = "true";
    button.innerHTML = '<span class="folder folder-blue">●</span><span></span><small>0</small>';
    button.querySelector("span:nth-child(2)").textContent = name;
    container.append(button);
  });
}

$$(".nav-link").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$("#settings-button").addEventListener("click", () => setView("settings"));
$("#view-history").addEventListener("click", () => setView("history"));

$("#add-collection").addEventListener("click", () => $("#collection-dialog").showModal());
$("#collection-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("#collection-name");
  const name = input.value.trim();
  if (!name || collectionNames.some(existing => existing.toLowerCase() === name.toLowerCase())) return;
  collectionNames.push(name);
  renderCollections();
  persistData();
  input.value = "";
  $("#collection-dialog").close();
});
$("#collections").addEventListener("click", event => {
  const button = event.target.closest("[data-collection]");
  if (!button) return;
  $("#collection-title").textContent = button.dataset.collection + ".";
  setView("collection", button.dataset.collection);
});

$$(".result-tab").forEach(button => {
  button.addEventListener("click", () => {
    $$(".result-tab").forEach(tab => tab.classList.toggle("active", tab === button));
    $$(".result-panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== button.dataset.panel));
  });
});

function setStep(index) {
  $$(".workflow-step").forEach((step, i) => {
    step.classList.toggle("running", i === index);
    step.classList.toggle("done", i < index || index >= 4);
    $(".workflow-status", step).textContent =
      i < index || index >= 4 ? "Complete" : i === index ? "Working" : "Waiting";
  });
  progressBar.style.width = `${index >= 4 ? 100 : Math.max(5, (index + 1) * 25)}%`;
}

function updateElapsed(start) {
  const seconds = Math.floor((Date.now() - start) / 1000);
  $("#elapsed").textContent = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function displayText(id, value) {
  const panel = $("#" + id);
  const text = escapeText(value).trim();
  if ((id === "report-panel" || id === "critic-panel") && text) {
    renderMarkdown(panel, text);
    return;
  }
  panel.textContent = text || "No content returned.";
}

function appendInlineText(parent, text) {
  const tokens = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g);
  tokens.forEach(token => {
    if (!token) return;
    const node = document.createElement(token.startsWith("`") ? "code" : (token.startsWith("**") || token.startsWith("__")) ? "strong" : "span");
    node.textContent = token.startsWith("**") || token.startsWith("__") ? token.slice(2, -2) : token.startsWith("`") ? token.slice(1, -1) : token;
    parent.append(node);
  });
}

function renderMarkdown(container, markdown) {
  container.replaceChildren();
  let list = null;
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement("p");
    appendInlineText(p, paragraph.join(" "));
    container.append(p);
    paragraph = [];
  };
  const closeList = () => { list = null; };

  markdown.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); closeList(); return; }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      const h = document.createElement(`h${Math.min(4, heading[1].length + 1)}`);
      appendInlineText(h, heading[2]);
      container.append(h);
      return;
    }
    if (/^(---+|\*\*\*+)$/.test(trimmed)) {
      flushParagraph(); closeList(); container.append(document.createElement("hr")); return;
    }
    const item = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (item) {
      flushParagraph();
      const ordered = /^\d/.test(trimmed);
      if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
        list = document.createElement(ordered ? "ol" : "ul");
        container.append(list);
      }
      const li = document.createElement("li");
      appendInlineText(li, item[1]);
      list.append(li);
      return;
    }
    closeList();
    paragraph.push(trimmed);
  });
  flushParagraph();
}

function openReport(item) {
  currentReport = item;
  $(".main-content").classList.add("report-mode");
  $("#home-view").classList.add("report-open");
  $("#result-topic").textContent = item.topic;
  displayText("report-panel", item.report);
  displayText("sources-panel", item.search_result);
  displayText("extracted-panel", item.scraped_content);
  displayText("critic-panel", item.feedback);
  $("#save-report").textContent = savedIds.has(item.id) ? "♥ Saved" : "♡ Save";
  resultsSection.classList.remove("hidden");
  $$(".result-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.panel === "report-panel"));
  $$(".result-panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== "report-panel"));
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#back-workspace").addEventListener("click", () => {
  $(".main-content").classList.remove("report-mode");
  $("#home-view").classList.remove("report-open");
  resultsSection.classList.add("hidden");
  progressPanel.classList.add("hidden");
  $(".main-content").scrollTo({ top: 0, behavior: "smooth" });
});

function renderList(selector, items, savedMode) {
  const container = $(selector);
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = savedMode ? "You haven't saved a report yet." : "No research history yet. Start by searching for a topic.";
    container.append(empty);
    return;
  }

  [...items].reverse().forEach(item => {
    const row = document.createElement("article");
    row.className = "history-item";
    const art = document.createElement("div");
    art.className = "report-art";
    art.textContent = "▤";
    const copy = document.createElement("div");
    copy.className = "history-item-copy";
    const title = document.createElement("h3");
    title.textContent = item.topic;
    const desc = document.createElement("p");
    desc.textContent = new Date(item.createdAt).toLocaleString();
    copy.append(title, desc);
    const actions = document.createElement("div");
    actions.className = "history-item-actions";
    const open = document.createElement("button");
    open.className = "outline-button";
    open.textContent = "Open";
    open.addEventListener("click", () => {
      setView("home", "Home");
      openReport(item);
    });
    actions.append(open);
    if (!savedMode) {
      const save = document.createElement("button");
      save.className = "outline-button";
      save.textContent = savedIds.has(item.id) ? "♥" : "♡ Save";
      save.addEventListener("click", () => {
        savedIds.has(item.id) ? savedIds.delete(item.id) : savedIds.add(item.id);
        persistData();
        renderList(selector, historyItems, false);
      });
      actions.append(save);
    }
    const remove = document.createElement("button");
    remove.className = "outline-button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete report: ${item.topic}`);
    remove.addEventListener("click", () => {
      historyItems = historyItems.filter(report => report.id !== item.id);
      savedIds.delete(item.id);
      persistData();
      renderList(selector, savedMode ? historyItems.filter(report => savedIds.has(report.id)) : historyItems, savedMode);
    });
    actions.append(remove);
    row.append(art, copy, actions);
    container.append(row);
  });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const topic = topicInput.value.trim();
  if (topic.length < 3) {
    showError("Enter a research topic with at least 3 characters.");
    return;
  }

  errorBox.classList.add("hidden");
  $(".main-content").classList.remove("report-mode");
  $("#home-view").classList.remove("report-open");
  resultsSection.classList.add("hidden");
  progressPanel.classList.remove("hidden");
  $("#progress-title").textContent = "Your agents are at work";
  submitBtn.disabled = true;
  submitBtn.textContent = "…";
  const start = Date.now();
  updateElapsed(start);
  elapsedTimer = setInterval(() => updateElapsed(start), 1000);
  setStep(0);

  // Visual estimates only. True per-agent progress requires backend streaming/events.
  stageTimers = [
    setTimeout(() => setStep(1), 7000),
    setTimeout(() => setStep(2), 20000),
    setTimeout(() => setStep(3), 40000)
  ];

  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      topic: data.topic || topic,
      search_result: data.search_result || "",
      scraped_content: data.scraped_content || "",
      report: typeof data.report === "string" ? data.report : JSON.stringify(data.report ?? "", null, 2),
      feedback: typeof data.feedback === "string" ? data.feedback : JSON.stringify(data.feedback ?? "", null, 2),
      createdAt: Date.now()
    };
    historyItems.push(item);
    persistData();
    currentReport = item;
    setStep(4);
    $("#progress-title").textContent = "Research completed!";
    progressPanel.classList.add("hidden");
    openReport(item);
  } catch (error) {
    showError(`${error.message} Make sure FastAPI is running and /api/research is available.`);
  } finally {
    stageTimers.forEach(clearTimeout);
    clearInterval(elapsedTimer);
    submitBtn.disabled = false;
    submitBtn.textContent = "→";
  }
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

$("#copy-report").addEventListener("click", async () => {
  if (!currentReport) return;
  try {
    await navigator.clipboard.writeText(currentReport.report || "");
    $("#copy-report").textContent = "Copied!";
    setTimeout(() => $("#copy-report").textContent = "Copy report", 1500);
  } catch {
    showError("Clipboard access failed. You can select and copy the report text manually.");
  }
});

$("#save-report").addEventListener("click", () => {
  if (!currentReport) return;
  if (savedIds.has(currentReport.id)) savedIds.delete(currentReport.id);
  else savedIds.add(currentReport.id);
  persistData();
  $("#save-report").textContent = savedIds.has(currentReport.id) ? "♥ Saved" : "♡ Save";
  if (!$("#saved-view").classList.contains("hidden")) renderList("#saved-list", historyItems.filter(item => savedIds.has(item.id)), true);
});

// Restore browser-local workspace data when the page opens.
renderCollections();

topicInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
