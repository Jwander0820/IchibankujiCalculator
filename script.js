const defaults = {
  total: 80,
  want: 5,
  n: 1,
  targetProb: 70,
  price: 280,
};

const totalInput = document.getElementById("total");
const wantInput = document.getElementById("want");
const nInput = document.getElementById("n");
const targetProbInput = document.getElementById("target-prob");
const priceInput = document.getElementById("price");

const currentNSpan = document.getElementById("current-n");
const pHyperSpan = document.getElementById("p_hyper");
const n20Span = document.getElementById("n20");
const p20Span = document.getElementById("p20");
const n50Span = document.getElementById("n50");
const p50Span = document.getElementById("p50");
const targetLabel = document.getElementById("target-label");
const nTargetSpan = document.getElementById("ntarget");
const pTargetSpan = document.getElementById("ptarget");
const costCurrent = document.getElementById("cost-current");
const costTarget = document.getElementById("cost-target");

const resetBtn = document.getElementById("reset-btn");
const shareBtn = document.getElementById("share-btn");
const shareMsg = document.getElementById("share-msg");
const tbody = document.querySelector("#prob-table tbody");

const MAX_SEARCH = 30;

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) result = (result * (n - i + 1)) / i;
  return result;
}

function hyperProb(T, K, N) {
  if (T <= 0) return 0;
  if (K <= 0) return 0;
  if (N <= 0) return 0;
  if (N >= T) return 1;
  return 1 - comb(T - K, N) / comb(T, N);
}

function currency(v) {
  return `NT$ ${Math.round(v).toLocaleString("zh-Hant-TW")}`;
}

function findMinDrawsByThreshold(T, K, threshold) {
  for (let i = 1; i <= MAX_SEARCH; i++) {
    const p = hyperProb(T, K, i);
    if (p >= threshold) return { n: i, p };
  }
  return null;
}

function syncFromQuery() {
  const q = new URLSearchParams(location.search);
  for (const [key, input] of Object.entries({
    total: totalInput,
    want: wantInput,
    n: nInput,
    targetProb: targetProbInput,
    price: priceInput,
  })) {
    if (q.has(key)) input.value = q.get(key);
  }
}

function persistInputs() {
  const payload = {
    total: totalInput.value,
    want: wantInput.value,
    n: nInput.value,
    targetProb: targetProbInput.value,
    price: priceInput.value,
  };
  localStorage.setItem("ichiban_calc_state", JSON.stringify(payload));
}

function restoreInputs() {
  const raw = localStorage.getItem("ichiban_calc_state");
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    totalInput.value = saved.total ?? totalInput.value;
    wantInput.value = saved.want ?? wantInput.value;
    nInput.value = saved.n ?? nInput.value;
    targetProbInput.value = saved.targetProb ?? targetProbInput.value;
    priceInput.value = saved.price ?? priceInput.value;
  } catch {
    localStorage.removeItem("ichiban_calc_state");
  }
}

function calculate() {
  const T = Math.max(0, Number(totalInput.value));
  const K = Math.max(0, Number(wantInput.value));
  const N = Math.max(0, Number(nInput.value));
  const targetPct = Math.min(99.9, Math.max(1, Number(targetProbInput.value)));
  const price = Math.max(0, Number(priceInput.value));

  targetProbInput.value = targetPct;
  targetLabel.textContent = targetPct.toFixed(1).replace(/\.0$/, "");

  const pCurrent = hyperProb(T, K, N);
  currentNSpan.textContent = N;
  pHyperSpan.textContent = `${(pCurrent * 100).toFixed(2)}%`;
  costCurrent.textContent = currency(price * N);

  const t20 = findMinDrawsByThreshold(T, K, 0.2);
  const t50 = findMinDrawsByThreshold(T, K, 0.5);
  const tCustom = findMinDrawsByThreshold(T, K, targetPct / 100);

  n20Span.textContent = t20 ? t20.n : "超過30";
  p20Span.textContent = t20 ? `${(t20.p * 100).toFixed(2)}%` : "-";

  n50Span.textContent = t50 ? t50.n : "超過30";
  p50Span.textContent = t50 ? `${(t50.p * 100).toFixed(2)}%` : "-";

  nTargetSpan.textContent = tCustom ? tCustom.n : "超過30";
  pTargetSpan.textContent = tCustom ? `${(tCustom.p * 100).toFixed(2)}%` : "-";
  costTarget.textContent = tCustom ? currency(price * tCustom.n) : "-";

  tbody.textContent = "";
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= MAX_SEARCH; i++) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${i}</td><td>${(hyperProb(T, K, i) * 100).toFixed(2)}%</td><td>${currency(price * i)}</td>`;
    frag.appendChild(row);
  }
  tbody.appendChild(frag);

  persistInputs();
}

function resetDefaults() {
  totalInput.value = defaults.total;
  wantInput.value = defaults.want;
  nInput.value = defaults.n;
  targetProbInput.value = defaults.targetProb;
  priceInput.value = defaults.price;
  calculate();
}

async function copyShareLink() {
  const query = new URLSearchParams({
    total: totalInput.value,
    want: wantInput.value,
    n: nInput.value,
    targetProb: targetProbInput.value,
    price: priceInput.value,
  });
  const url = `${location.origin}${location.pathname}?${query.toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    shareMsg.textContent = "已複製分享連結！";
  } catch {
    shareMsg.textContent = "複製失敗，請手動複製網址列。";
  }
}

[totalInput, wantInput, nInput, targetProbInput, priceInput].forEach((el) => {
  el.addEventListener("input", calculate);
});
resetBtn.addEventListener("click", resetDefaults);
shareBtn.addEventListener("click", copyShareLink);

restoreInputs();
syncFromQuery();
calculate();
