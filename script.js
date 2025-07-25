const totalInput = document.getElementById("total");
const wantInput = document.getElementById("want");
const nInput = document.getElementById("n");
const currentNSpan = document.getElementById("current-n");
const pHyperSpan = document.getElementById("p_hyper");
const n20Span = document.getElementById("n20");
const p20Span = document.getElementById("p20");
const n50Span = document.getElementById("n50");
const p50Span = document.getElementById("p50");
const tbody = document.querySelector("#prob-table tbody");

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
  return result;
}

function hyperProb(T, K, N) {
  return N > T ? 1 : 1 - comb(T - K, N) / comb(T, N);
}

function calculate() {
  const T = +totalInput.value;
  const K = +wantInput.value;
  const N = +nInput.value;
  if (T <= 0 || K < 0 || N < 0) return;

  // 主要結果
  const p_h = hyperProb(T, K, N) * 100;
  currentNSpan.textContent = N;
  pHyperSpan.textContent = p_h.toFixed(2);

  // 計算達標最少抽數與對應機率
  let found20 = "-", found50 = "-";
  for (let i = 1; i <= 30; i++) {
    const p = hyperProb(T, K, i);
    if (found20 === "-" && p >= 0.20) found20 = i;
    if (found50 === "-" && p >= 0.50) found50 = i;
    if (found20 !== "-" && found50 !== "-") break;
  }
  n20Span.textContent = found20;
  p20Span.textContent = found20 === "-" ? "-" : (hyperProb(T, K, found20) * 100).toFixed(2);
  n50Span.textContent = found50;
  p50Span.textContent = found50 === "-" ? "-" : (hyperProb(T, K, found50) * 100).toFixed(2);

  // 列表
  tbody.textContent = '';
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= 30; i++) {
    const p = (hyperProb(T, K, i) * 100).toFixed(2);
    const row = document.createElement("tr");
    row.innerHTML = `<td>${i}</td><td>${p}%</td>`;
    frag.appendChild(row);
  }
  tbody.appendChild(frag);
}

document.querySelectorAll('#total, #want, #n').forEach(el => el.addEventListener("input", calculate));

calculate();