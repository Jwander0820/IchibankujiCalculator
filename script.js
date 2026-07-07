const defaults = { total: 80, want: 5, n: 1, targetProb: 20, price: 335 };
const MAX_SEARCH = 30;
const STATE_KEY = "ichiban_calc_state_v2";
const SETS_KEY = "ichiban_calc_saved_sets_v1";

const $ = (selector) => document.querySelector(selector);
const inputs = {
  total: $("#total"), want: $("#want"), n: $("#n"),
  targetProb: $("#target-prob"), price: $("#price"),
};
const output = {
  currentN: $("#current-n"), probability: $("#p_hyper"), chanceBar: $("#chance-bar"),
  targetLabel: $("#target-label"), n20: $("#n20"), p20: $("#p20"),
  n50: $("#n50"), p50: $("#p50"), nTarget: $("#ntarget"),
  costCurrent: $("#cost-current"), costTarget: $("#cost-target"),
  verdict: $("#verdict-badge"), validation: $("#validation-msg"),
};
const tbody = $("#prob-table tbody");
const resultTicket = $(".result-ticket");
const savedSetsEl = $("#saved-sets");
const emptySetsEl = $("#empty-sets");
const quickPresets = $(".quick-presets");
const savedSetShortcuts = $("#saved-set-shortcuts");
const toast = $("#toast");
let toastTimer;

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i += 1) result = (result * (n - i + 1)) / i;
  return result;
}

function hyperProb(total, targets, draws) {
  if (total <= 0 || targets <= 0 || draws <= 0) return 0;
  if (draws >= total) return 1;
  const validTargets = Math.min(targets, total);
  return 1 - comb(total - validTargets, draws) / comb(total, draws);
}

function currency(value) {
  return `NT$${Math.round(value).toLocaleString("zh-Hant-TW")}`;
}

function readValues() {
  const total = Math.max(1, Math.floor(Number(inputs.total.value) || 1));
  const want = Math.min(total, Math.max(0, Math.floor(Number(inputs.want.value) || 0)));
  const n = Math.min(total, Math.max(1, Math.floor(Number(inputs.n.value) || 1)));
  const targetProb = Math.min(99.9, Math.max(1, Number(inputs.targetProb.value) || 20));
  const price = Math.max(0, Math.round(Number(inputs.price.value) || 0));
  return { total, want, n, targetProb, price };
}

function writeValues(values) {
  Object.entries(values).forEach(([key, value]) => {
    if (inputs[key] && value !== undefined) inputs[key].value = value;
  });
}

function hasReachedTarget(probability, target) {
  return Math.round(probability * 10000) >= Math.round(target * 10000);
}

function findMinDraws(total, targets, threshold) {
  const limit = Math.min(MAX_SEARCH, total);
  for (let draws = 1; draws <= limit; draws += 1) {
    const probability = hyperProb(total, targets, draws);
    if (hasReachedTarget(probability, threshold)) return { n: draws, p: probability };
  }
  return null;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function persistState(values) {
  localStorage.setItem(STATE_KEY, JSON.stringify(values));
}

function getVerdict(probability, target) {
  if (hasReachedTarget(probability, target)) return { label: "達到期望", className: "is-good" };
  if (probability >= target * 0.72) return { label: "接近目標", className: "is-close" };
  return { label: "建議觀望", className: "is-wait" };
}

function renderTable(values) {
  const fragment = document.createDocumentFragment();
  const target = values.targetProb / 100;
  tbody.textContent = "";
  for (let draws = 1; draws <= Math.min(MAX_SEARCH, values.total); draws += 1) {
    const probability = hyperProb(values.total, values.want, draws);
    const reachedTarget = hasReachedTarget(probability, target);
    const row = document.createElement("tr");
    if (draws === values.n) row.classList.add("is-current");
    if (reachedTarget) row.classList.add("has-reached-target");
    const status = reachedTarget ? "達標" : probability >= 0.5 ? "可考慮" : "觀望";
    row.innerHTML = `<td><b>${draws}</b> 抽</td><td><strong>${(probability * 100).toFixed(2)}%</strong></td><td>${currency(values.price * draws)}</td><td><span class="table-status">${status}</span></td>`;
    fragment.appendChild(row);
  }
  tbody.appendChild(fragment);
}

function calculate({ normalize = false } = {}) {
  const values = readValues();
  if (normalize) writeValues(values);

  const probability = hyperProb(values.total, values.want, values.n);
  const target = values.targetProb / 100;
  const t20 = findMinDraws(values.total, values.want, 0.2);
  const t50 = findMinDraws(values.total, values.want, 0.5);
  const tCustom = findMinDraws(values.total, values.want, target);
  const unavailable = "30+";

  output.currentN.textContent = values.n;
  output.probability.textContent = (probability * 100).toFixed(2);
  output.chanceBar.style.width = `${Math.max(2, probability * 100)}%`;
  output.targetLabel.textContent = values.targetProb.toFixed(1).replace(/\.0$/, "");
  output.costCurrent.textContent = currency(values.price * values.n);
  output.n20.textContent = t20 ? t20.n : unavailable;
  output.p20.textContent = t20 ? (t20.p * 100).toFixed(1) : "—";
  output.n50.textContent = t50 ? t50.n : unavailable;
  output.p50.textContent = t50 ? (t50.p * 100).toFixed(1) : "—";
  output.nTarget.textContent = tCustom ? tCustom.n : unavailable;
  output.costTarget.textContent = tCustom ? currency(values.price * tCustom.n) : "超過 30 抽";

  const verdict = getVerdict(probability, target);
  output.verdict.textContent = verdict.label;
  output.verdict.className = `verdict-badge ${verdict.className}`;
  resultTicket.classList.toggle("is-success", hasReachedTarget(probability, target));
  output.validation.textContent = Number(inputs.want.value) > values.total ? "目標賞不能多於剩餘總抽數，已依總抽數計算。" : "";

  renderTable(values);
  persistState(values);
  return values;
}

function loadInitialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || localStorage.getItem("ichiban_calc_state"));
    if (saved) writeValues({ ...defaults, ...saved });
  } catch { localStorage.removeItem(STATE_KEY); }

  const query = new URLSearchParams(location.search);
  const queryValues = {};
  Object.keys(inputs).forEach((key) => {
    if (query.has(key)) queryValues[key] = query.get(key);
  });
  writeValues(queryValues);
}

function getSavedSets() {
  try { return JSON.parse(localStorage.getItem(SETS_KEY)) || []; }
  catch { localStorage.removeItem(SETS_KEY); return []; }
}

function saveSets(sets) {
  localStorage.setItem(SETS_KEY, JSON.stringify(sets));
  renderSavedSets();
}

function renderSavedSets() {
  const sets = getSavedSets();
  savedSetsEl.textContent = "";
  savedSetShortcuts.textContent = "";
  emptySetsEl.hidden = sets.length > 0;
  sets.forEach((set) => {
    const probability = hyperProb(set.total, set.want, set.n) * 100;
    const card = document.createElement("article");
    card.className = "set-card";
    card.innerHTML = `
      <div class="set-card__top"><span>${set.want} 個目標賞 / ${set.total} 抽</span><button type="button" data-delete="${set.id}" aria-label="刪除這個觀察 Set">×</button></div>
      <h3>${escapeHtml(set.name)}</h3>
      <div class="set-card__odds"><strong>${probability.toFixed(1)}%</strong><span>抽 ${set.n} 次<br>${currency(set.price * set.n)}</span></div>
      <button class="set-card__load" type="button" data-load="${set.id}">載入這個盤面 <span>→</span></button>`;
    savedSetsEl.appendChild(card);

    const shortcut = document.createElement("button");
    shortcut.className = "preset-chip preset-chip--saved";
    shortcut.type = "button";
    shortcut.dataset.quickSet = set.id;
    shortcut.title = `${set.total} 抽・${set.want} 個目標賞・打算抽 ${set.n} 次`;
    shortcut.textContent = `★ ${set.name}`;
    savedSetShortcuts.appendChild(shortcut);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

$("#save-set-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const nameInput = $("#set-name");
  const name = nameInput.value.trim();
  if (!name) return;
  const sets = getSavedSets();
  sets.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, ...calculate({ normalize: true }), savedAt: Date.now() });
  saveSets(sets.slice(0, 8));
  nameInput.value = "";
  showToast("已保存這個觀察 Set");
});

savedSetsEl.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load]");
  const deleteButton = event.target.closest("[data-delete]");
  if (loadButton) {
    const set = getSavedSets().find((item) => item.id === loadButton.dataset.load);
    if (set) { writeValues(set); calculate({ normalize: true }); window.scrollTo({ top: 0, behavior: "smooth" }); showToast(`已載入「${set.name}」`); }
  }
  if (deleteButton) {
    const nextSets = getSavedSets().filter((item) => item.id !== deleteButton.dataset.delete);
    saveSets(nextSets);
    showToast("已移除觀察 Set");
  }
});

quickPresets.addEventListener("click", (event) => {
  const button = event.target.closest(".preset-chip");
  if (!button) return;

  if (button.dataset.quickSet) {
    const set = getSavedSets().find((item) => item.id === button.dataset.quickSet);
    if (set) {
      writeValues(set);
      calculate({ normalize: true });
      showToast(`已載入「${set.name}」`);
    }
  } else {
    writeValues({ total: button.dataset.total, want: button.dataset.want, n: button.dataset.n });
    calculate({ normalize: true });
    showToast(`已帶入「${button.textContent}」`);
  }
});

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", () => calculate());
  input.addEventListener("blur", () => calculate({ normalize: true }));
  input.addEventListener("focus", () => input.select());
});

$("#reset-btn").addEventListener("click", () => {
  writeValues(defaults); calculate({ normalize: true }); showToast("已恢復預設盤面");
});

$("#share-btn").addEventListener("click", async () => {
  const values = calculate({ normalize: true });
  const url = `${location.origin}${location.pathname}?${new URLSearchParams(values)}`;
  try { await navigator.clipboard.writeText(url); showToast("分析連結已複製"); }
  catch { window.prompt("複製以下分析連結", url); }
});

loadInitialState();
calculate({ normalize: true });
renderSavedSets();
