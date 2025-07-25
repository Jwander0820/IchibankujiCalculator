const totalInput = document.getElementById("total");
const wantInput = document.getElementById("want");
const nInput = document.getElementById("n");
const currentNSpan = document.getElementById("current-n");
const pHyperSpan = document.getElementById("p_hyper");
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
  const p_hyper = hyperProb(T, K, N) * 100;
  currentNSpan.textContent = N;
  pHyperSpan.textContent = p_hyper.toFixed(2);
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

[totalInput, wantInput, nInput].forEach(el => el.addEventListener("input", calculate));
calculate();