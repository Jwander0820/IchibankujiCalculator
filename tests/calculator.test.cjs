const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const STATE_KEY = 'ichiban_calc_state_v2';
const SETS_KEY = 'ichiban_calc_saved_sets_v1';
const ACTIVE_SET_KEY = 'ichiban_calc_active_set_v1';
const defaultValues = { total: 80, want: 5, n: 1, targetProb: 20, price: 335 };

// A small DOM model lets the real startup and registered handlers run in Node.
// It preserves node identity but does not simulate native pointer event ordering.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.value = '';
    this.hidden = false;
    this._text = '';
    this._html = '';
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
      toggle: (name, force = !this.classes.has(name)) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
        return force;
      },
    };
    this.style = {
      setProperty(name, value) { this[name] = value; },
      removeProperty(name) { delete this[name]; },
    };
  }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(value) { this._html = String(value); this.children = []; }
  get innerHTML() {
    return this._html || this._text.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') this.children.push(...child.children);
    else this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, target = this) {
    for (const listener of this.listeners.get(type) || []) listener({ target, preventDefault() {} });
  }
  closest(selector) {
    if (selector === '[data-load]' && this.dataset.load) return this;
    if (selector === '[data-delete]' && this.dataset.delete) return this;
    if (selector === '.preset-chip' && this.classList.contains('preset-chip')) return this;
    return null;
  }
  focus() {}
  select() {}
}

function startApp({ search = '', storage = {} } = {}) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  for (const [key, value] of Object.entries(defaultValues)) {
    node(key === 'targetProb' ? '#target-prob' : `#${key}`).value = String(value);
  }
  const stored = new Map(Object.entries(storage));
  const writes = [];
  const stats = { rngCalls: 0 };
  const context = vm.createContext({
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      createElement: (tag) => new Element(tag),
      createDocumentFragment: () => new Element('#fragment'),
      addEventListener() {},
      body: new Element('body'),
      activeElement: null,
    },
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => { stored.set(key, String(value)); writes.push(key); },
      removeItem: (key) => stored.delete(key),
    },
    location: { search, origin: 'https://example.test', pathname: '/' },
    window: { scrollTo() {}, prompt() {} },
    navigator: { clipboard: { async writeText() {} } },
    URLSearchParams,
    crypto: {
      getRandomValues: (array) => { stats.rngCalls += 1; array.fill(0x80000000); return array; },
      randomUUID: () => 'test-created-id',
    },
    Date: class extends Date { static now() { return 2000000000000; } },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  vm.runInContext(source, context, { timeout: 1000 });
  return {
    node, stored, writes, stats, context,
    run: (expression) => vm.runInContext(expression, context, { timeout: 1000 }),
  };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

function assertBounded(values) {
  for (const key of Object.keys(defaultValues)) assert.equal(Number.isFinite(values[key]), true, key);
  assert.ok(Number.isInteger(values.total) && values.total >= 1 && values.total <= 10000);
  assert.ok(Number.isInteger(values.want) && values.want >= 0 && values.want <= values.total);
  assert.ok(Number.isInteger(values.n) && values.n >= 1 && values.n <= values.total);
  assert.ok(values.targetProb >= 1 && values.targetProb <= 99.9);
  assert.ok(Number.isInteger(values.price) && values.price >= 0 && values.price <= 1000000);
}

function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  let result = 1n;
  for (let i = 1; i <= k; i += 1) result = result * BigInt(n - i + 1) / BigInt(i);
  return result;
}

test('hypergeometric probability stays finite when combinations overflow Number', () => {
  const app = startApp();
  const probability = app.run('hyperProb(1100, 5, 550)');
  assert.ok(Math.abs(probability - 0.96903396059897) < 1e-13, String(probability));
  for (const args of [[10000, 1, 1], [10000, 5000, 5000], [10000, 0, 10000]]) {
    const result = app.run(`hyperProb(${args.join(',')})`);
    assert.ok(Number.isFinite(result) && result >= 0 && result <= 1);
  }
});

test('hypergeometric probability matches independent exact combination counts', () => {
  const app = startApp();
  const hyperProb = app.run('hyperProb');
  for (let total = 1; total <= 24; total += 1) {
    for (let targets = 0; targets <= total; targets += 1) {
      let previous = 0;
      for (let draws = 0; draws <= total; draws += 1) {
        const denominator = choose(total, draws);
        const expected = Number(denominator - choose(total - targets, draws)) / Number(denominator);
        const actual = hyperProb(total, targets, draws);
        assert.ok(Math.abs(actual - expected) < 1e-12, `${total}, ${targets}, ${draws}: ${actual} != ${expected}`);
        assert.ok(actual >= previous - 1e-14);
        previous = actual;
      }
    }
  }
});

test('normalization clamps huge values and retains fractional probability and rounded price', () => {
  const app = startApp();
  assert.deepEqual(plain(app.run('normalizeValues({total:1e300,want:1e300,n:1e300,targetProb:1e300,price:1e300})')),
    { total: 10000, want: 10000, n: 10000, targetProb: 99.9, price: 1000000 });
  assert.deepEqual(plain(app.run('normalizeValues({total:8.9,want:99.9,n:99.9,targetProb:21.25,price:123.6})')),
    { total: 8, want: 8, n: 8, targetProb: 21.25, price: 124 });
  assert.deepEqual(plain(app.run('normalizeValues({total:-10,want:-2,n:-1,targetProb:-1,price:-1})')),
    { total: 1, want: 0, n: 1, targetProb: 1, price: 0 });
});

test('normalization always returns finite bounded fields for nonfinite or missing values', () => {
  const app = startApp();
  for (const value of ['Infinity', '-Infinity', 'NaN', 'undefined', 'null', '"not a number"']) {
    assertBounded(app.run(`normalizeValues({total:${value},want:${value},n:${value},targetProb:${value},price:${value}})`));
  }
  assertBounded(app.run('normalizeValues({})'));
});

test('startup normalizes hostile URL values and inactive saved sets before rendering', () => {
  const app = startApp({
    search: '?total=1e300&want=Infinity&n=1e300&targetProb=NaN&price=1e300',
    storage: {
      [ACTIVE_SET_KEY]: 'inactive',
      [SETS_KEY]: JSON.stringify([{ id: 'inactive', name: '舊盤面', total: '1e300', want: 5, n: '1e300', targetProb: 'Infinity', price: '1e300' }]),
    },
  });
  const values = JSON.parse(app.stored.get(STATE_KEY));
  assertBounded(values);
  assert.equal(values.total, 10000);
  assert.equal(values.n, 10000);
  assert.equal(app.stored.has(ACTIVE_SET_KEY), false);
  assertBounded(app.run('getSavedSets()[0]'));
  assert.doesNotMatch(app.node('#saved-sets').children[0].innerHTML, /NaN|Infinity/);
  assert.doesNotMatch(app.node('#p_hyper').textContent, /NaN|Infinity/);
  assert.equal(app.node('#prob-table tbody').children.length, 30);
});

test('the original billion-ticket URL is capped before startup calculation', () => {
  const app = startApp({ search: '?total=1000000000&want=1&n=500000000' });
  const values = JSON.parse(app.stored.get(STATE_KEY));
  assertBounded(values);
  assert.equal(values.total, 10000);
  assert.equal(values.want, 1);
  assert.equal(values.n, 10000);
  assert.equal(Number(app.node('#total').value), 10000);
  assert.equal(Number(app.node('#n').value), 10000);
  assert.equal(app.node('#p_hyper').textContent, '100.00');
  assert.equal(app.node('#prob-table tbody').children.length, 30);
});

test('current and legacy state restore cap huge numbers and reject nonfinite numbers', () => {
  const huge = '{"total":1e300,"want":1e300,"n":1e300,"targetProb":1e300,"price":1e300}';
  const nonfinite = '{"total":1e999,"want":1e999,"n":1e999,"targetProb":-1e999,"price":1e999}';
  for (const key of [STATE_KEY, 'ichiban_calc_state']) {
    for (const raw of [huge, nonfinite]) {
      const app = startApp({ storage: { [key]: raw } });
      const values = JSON.parse(app.stored.get(STATE_KEY));
      assertBounded(values);
      if (raw === huge) {
        assert.equal(values.total, 10000);
        assert.equal(values.n, 10000);
        assert.equal(values.price, 1000000);
      }
      assert.equal(Number.isFinite(Number(app.node('#p_hyper').textContent)), true);
      assert.doesNotMatch(app.node('#cost-current').textContent, /NaN|Infinity/);
    }
  }
});

test('malformed saved-set containers and records cannot break startup', () => {
  for (const raw of ['{}', 'null', '"bad"', '[null, 1, "bad", []]', '{broken']) {
    const app = startApp({ storage: { [SETS_KEY]: raw } });
    assert.deepEqual(plain(app.run('getSavedSets()')), []);
    assert.equal(app.node('#saved-sets').children.length, 0);
  }
});

test('simulation receives the same bounded values as calculation', () => {
  const app = startApp();
  app.node('#total').value = '1e300';
  app.node('#want').value = '1e300';
  app.node('#n').value = '1e300';
  app.node('#price').value = 'Infinity';
  app.run('globalThis.receivedDraws = null; simulateWithoutReplacement = (...args) => { globalThis.receivedDraws = args; return 0; }; prepareSimulation()');
  assert.deepEqual(plain(app.run('receivedDraws')), [10000, 10000, 10000]);
  assertBounded(app.run('simulationValues'));
  assert.equal(app.node('#sim-draws').textContent, '10000');
});

test('real simulation finishes within its draw cap for huge raw inputs', () => {
  const app = startApp();
  app.node('#total').value = '1000000000';
  app.node('#want').value = '1';
  app.node('#n').value = '500000000';
  // run() applies a VM timeout. The deterministic RNG returns 0.5, so the
  // single target is selected on the final draw when the whole box is drawn.
  const result = app.run(`(() => {
    const values = readValues();
    const hits = simulateWithoutReplacement(values.total, values.want, values.n);
    return { values, hits };
  })()`);
  assertBounded(result.values);
  assert.equal(result.values.total, 10000);
  assert.equal(result.values.n, 10000);
  assert.ok(Number.isInteger(result.hits) && result.hits >= 0);
  assert.ok(result.hits <= Math.min(result.values.want, result.values.n));
  assert.equal(result.hits, 1);
  assert.equal(app.stats.rngCalls, 10000);
});

test('zero remaining targets are displayed as impossible instead of requiring more draws', () => {
  const app = startApp({ search: '?total=80&want=0&n=10&targetProb=20&price=335' });
  assert.equal(app.node('#p_hyper').textContent, '0.00');
  for (const selector of ['#n20', '#n50', '#ntarget']) assert.equal(app.node(selector).textContent, '—');
  assert.equal(app.node('#cost-target').textContent, '無法達成');
  assert.equal(app.node('#verdict-badge').textContent, '目標賞已抽完');
});

test('a reachable target beyond the first 30 draws retains the 30+ display', () => {
  const app = startApp({ search: '?total=10000&want=1&n=1&targetProb=20&price=335' });
  for (const selector of ['#n20', '#n50', '#ntarget']) assert.equal(app.node(selector).textContent, '30+');
  assert.equal(app.node('#cost-target').textContent, '超過 30 抽');
  assert.notEqual(app.node('#verdict-badge').textContent, '目標賞已抽完');
});

function savedApp() {
  const sets = [
    { id: 'first', name: '第一盤', ...defaultValues, savedAt: 100, updatedAt: 200 },
    { id: 'second', name: '第二盤', total: 50, want: 2, n: 4, targetProb: 30, price: 400, savedAt: 300, updatedAt: 400 },
  ];
  return startApp({ storage: {
    [STATE_KEY]: JSON.stringify(defaultValues),
    [SETS_KEY]: JSON.stringify(sets),
    [ACTIVE_SET_KEY]: 'first',
  } });
}

test('unchanged input blur preserves saved card nodes, shortcuts, and timestamps', () => {
  const app = savedApp();
  const card = app.node('#saved-sets').children[0];
  const shortcut = app.node('#saved-set-shortcuts').children[0];
  const before = app.stored.get(SETS_KEY);
  const writesBefore = app.writes.filter((key) => key === SETS_KEY).length;
  app.node('#total').dispatch('blur');
  assert.equal(app.node('#saved-sets').children[0], card);
  assert.equal(app.node('#saved-set-shortcuts').children[0], shortcut);
  assert.equal(app.stored.get(SETS_KEY), before);
  assert.equal(JSON.parse(before)[0].updatedAt, 200);
  assert.equal(app.writes.filter((key) => key === SETS_KEY).length, writesBefore);
});

test('loading an unchanged saved set updates active card and shortcut UI', () => {
  for (const viaShortcut of [false, true]) {
    const app = savedApp();
    const target = new Element('button');
    if (viaShortcut) {
      target.className = 'preset-chip preset-chip--saved';
      target.dataset.quickSet = 'second';
      app.node('.quick-presets').dispatch('click', target);
    } else {
      target.dataset.load = 'second';
      app.node('#saved-sets').dispatch('click', target);
    }
    assert.equal(app.stored.get(ACTIVE_SET_KEY), 'second');
    assert.equal(Number(app.node('#total').value), 50);
    assert.equal(Number(app.node('#n').value), 4);
    assert.equal(app.node('#saved-sets').children[0].classList.contains('is-active'), false);
    assert.equal(app.node('#saved-sets').children[1].classList.contains('is-active'), true);
    assert.equal(app.node('#saved-set-shortcuts').children[1].getAttribute('aria-pressed'), 'true');
    assert.match(app.node('#active-set-status').textContent, /第二盤/);
    assert.equal(JSON.parse(app.stored.get(SETS_KEY))[1].updatedAt, 400);
  }
});
