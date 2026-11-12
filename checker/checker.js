// Gold Reality Check: the calculation core (design: docs/product/CHECKER_DESIGN.md).
// Plain functions with no outside library, used by index.html in the browser and tested with
// Node (tests/checker/checker.test.mjs). Nothing leaves the trader's computer.

export const DEFAULTS = Object.freeze({
  mode: 'add',          // 'add' realistic costs, or 'real' account history (costs already in the prices)
  spread: 0.48,         // USD an ounce, paid once a round trip
  slippage: 0.10,       // USD an ounce, each side
  longRate: 0.0592,     // yearly financing a long pays (T-bill 4.03% + 1.89%)
  shortRate: 0.0367,    // yearly financing a short receives (T-bill 4.03% - 0.36%)
  ounces: 100,          // ounces in one lot of XAUUSD
  utc: false,           // false: times are MT5 server time, whose midnight is the 17:00 New York rollover
  tried: 1,             // strategies the trader has tried; the chance bar is 0.05 divided by this
  useStops: true,       // results in R when every trade has a stop on its losing side
  minTrades: 200
});
export const SEED = 20261111;
const ALPHA = 0.05, POWER_Z = 0.8416212335729143, HEADER_LINES = 40;

// ---------- reading the table ----------

function splitLine(line, sep) {
  const out = []; let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell);
  return out.map((c) => c.trim());
}

const key = (s) => s.toLowerCase().replace(/[\s_\-\/.]+/g, '');
const ALIASES = {
  open_time: ['opentime', 'open', 'timeopen', 'entrytime'],
  close_time: ['closetime', 'close', 'timeclose', 'exittime'],
  side: ['side', 'type', 'direction', 'action'],
  lots: ['lots', 'volume', 'size', 'lot'],
  entry: ['entry', 'openprice', 'entryprice', 'priceopen'],
  exit: ['exit', 'closeprice', 'exitprice', 'priceclose'],
  stop: ['stop', 'sl', 'stoploss'],
  commission: ['commission', 'fee', 'fees'],
  swap: ['swap', 'financing', 'rollover'],
  profit: ['profit', 'pnl', 'pl', 'result'],
  symbol: ['symbol', 'instrument', 'market']
};
const REQUIRED = ['open_time', 'close_time', 'side', 'lots', 'entry', 'exit'];
const NUMBERS = ['lots', 'entry', 'exit', 'stop', 'commission', 'taxes', 'swap', 'profit'];
const MT5 = ['time', 'position', 'symbol', 'type', 'volume', 'price', 'sl', 'tp', 'time', 'price', 'commission', 'swap', 'profit'];
const MT5_COLUMNS = { open_time: 0, symbol: 2, side: 3, lots: 4, entry: 5, stop: 6, close_time: 8, exit: 9, commission: 10, swap: 11, profit: 12 };
// MetaTrader 4's Detailed Statement: its Closed Transactions table, with a Taxes column before Swap.
const MT4 = ['ticket', 'opentime', 'type', 'size', 'item', 'price', 'sl', 'tp', 'closetime', 'price', 'commission', 'taxes', 'swap', 'profit'];
const MT4_COLUMNS = { open_time: 1, side: 2, lots: 3, symbol: 4, entry: 5, stop: 6, close_time: 8, exit: 9, commission: 10, taxes: 11, swap: 12, profit: 13 };
const REPORTS = { mt5: [MT5, MT5_COLUMNS], mt4: [MT4, MT4_COLUMNS] };
// Buy and sell as MT5 terminals in common languages write them in a report's Type column.
// Words are compared without accents or marks, and with Turkish dotless i as i, so ALIŞ reads as alis.
const plain = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').toLowerCase().trim();
const BUY = ['buy', 'long', 'شراء', 'خرید', 'покупка', 'compra', 'achat', 'kauf', 'alis', 'beli', 'acquisto', 'kupno', 'mua',
  '买入', '買入', '買い', '매수'].map(plain);
const SELL = ['sell', 'short', 'بيع', 'فروش', 'продажа', 'venta', 'venda', 'vente', 'verkauf', 'satis', 'jual', 'vendita',
  'sprzedaz', 'ban', '卖出', '賣出', '売り', '매도'].map(plain);
// A side word, alone or followed by a space ("buy limit"); a Latin word of 4 letters or more may also start a longer one ("Kaufen").
const said = (s, w) => s === w || s.startsWith(w + ' ') || (w.length >= 4 && /^[a-z]+$/.test(w) && s.startsWith(w));
export function sideOf(text) {
  const s = plain(text);
  if (BUY.some((w) => said(s, w))) return 'BUY';
  if (SELL.some((w) => said(s, w))) return 'SELL';
  return null;
}
const MT_TIME = /^\d{4}[.\-/]\d{2}[.\-/]\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;

// The file's decimal mark: a comma when the separator is a semicolon, when a number has both marks
// and the comma comes last, or when a comma is followed by one or two digits (or follows four or more).
export function decimalMark(cells, sep) {
  if (sep === ';') return ',';
  for (const raw of cells) {
    const c = String(raw || '').replace(/[\s ']/g, '');
    if (c.includes('.') && c.includes(',')) return c.lastIndexOf(',') > c.lastIndexOf('.') ? ',' : '.';
    if (/^-?\d+,\d{1,2}$/.test(c) || /^-?\d{4,},\d+$/.test(c)) return ',';
  }
  return '.';
}

// A number written with the file's decimal mark. With a point, a comma is read as a thousands
// separator only in the 1,234,567.89 pattern; any other comma makes the cell unreadable (NaN).
export function number(text, mark = '.') {
  if (text === undefined || text === null) return NaN;
  let s = String(text).replace(/[\s ']/g, '');
  if (s === '') return NaN;
  if (mark === ',') s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return NaN;
    s = s.replace(/,/g, '');
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

// A time written as YYYY.MM.DD HH:MM[:SS] (MT5) or YYYY-MM-DD[ T]HH:MM[:SS], as milliseconds of that wall clock.
export function wallTime(text) {
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(text || '').trim());
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function separator(line) {
  if (line.includes('\t')) return '\t';
  return line.split(';').length > line.split(',').length ? ';' : ',';
}

// The header: the first of the first 40 lines that is a MetaTrader report's header (MT5 Positions,
// MT4 Closed Transactions) or holds every template column.
function findHeader(lines) {
  for (let i = 0; i < Math.min(lines.length, HEADER_LINES); i++) {
    const sep = separator(lines[i].text), head = splitLine(lines[i].text, sep).map(key);
    for (const [format, [names, columns]] of Object.entries(REPORTS)) {
      if (head.length >= names.length && names.every((name, k) => head[k] === name)) return { at: i, sep, format, col: { ...columns } };
    }
    const col = {};
    for (const [name, names] of Object.entries(ALIASES)) {
      const k = head.findIndex((h) => names.includes(h));
      if (k >= 0) col[name] = k;
    }
    if (REQUIRED.every((n) => n in col)) return { at: i, sep, format: 'template', col };
  }
  return null;
}

// MetaTrader rows found by their content, for a report whose column titles are in another language.
// MT5 Positions: a time in the 1st and 9th cells, buy or sell in the 4th, a volume and both prices.
// MT4 Closed Transactions: a time in the 2nd and 9th, buy or sell in the 3rd, a volume, both prices
// and a profit (a cancelled pending order has none).
const CONTENT = {
  mt5: { width: MT5.length, times: [0, 8], side: 3, numbers: [4, 5, 9] },
  mt4: { width: MT4.length, times: [1, 8], side: 2, numbers: [3, 5, 9, 13] }
};
function reportRows(lines) {
  for (const [format, c] of Object.entries(CONTENT)) {
    const rows = [];
    for (const line of lines) {
      const sep = separator(line.text), cells = splitLine(line.text, sep), mark = sep === ';' ? ',' : '.';
      if (cells.length >= c.width && c.times.every((k) => MT_TIME.test(cells[k])) && sideOf(cells[c.side])
          && c.numbers.every((k) => Number.isFinite(number(cells[k], mark)) || Number.isFinite(number(cells[k], '.')))) {
        rows.push({ row: line.row, cells, sep });
      }
    }
    if (rows.length) return { format, rows };
  }
  return null;
}

export function parseTable(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/)
    .map((t, i) => ({ text: t, row: i + 1 })).filter((l) => l.text.trim() !== '');
  // What was read, shown when a file fails: only the first row that looks like column titles (6 cells or
  // more), empty cells dropped and runs of 5 digits or more masked, so a report's name and account lines
  // never appear, nor a trade.
  const titles = lines.find((l) => splitLine(l.text, separator(l.text)).filter((c) => c !== '').length >= 6);
  const preview = titles ? [splitLine(titles.text, separator(titles.text)).filter((c) => c !== '').join(' | ')
    .replace(/\d{5,}/g, '…').slice(0, 160)] : [];
  if (!lines.length) return { trades: [], format: null, skipped: [], preview, error: 'EMPTY' };
  const header = findHeader(lines);
  let format, col, sep, body = [];
  const short = [];
  if (header) {
    ({ format, col, sep } = header);
    const width = splitLine(lines[header.at].text, sep).length;
    for (const line of lines.slice(header.at + 1)) {
      const cells = splitLine(line.text, sep), filled = cells.filter((c) => c !== '').length;
      if (filled <= 1) break;                                                // a section title ends the table
      if (filled < Math.ceil(width / 2)) {
        // An MT4 statement lists deposits and withdrawals among its trades, and ends the table with totals.
        const why = /^(balance|credit)$/i.test(cells[col.side] || '') ? 'BALANCE'
          : format !== 'template' && !MT_TIME.test(cells[col.open_time] || '') ? 'TOTALS' : 'SHORT_ROW';
        short.push({ row: line.row, reason: why });
        continue;
      }
      body.push({ row: line.row, cells });
    }
  } else {
    const found = reportRows(lines);
    if (!found) return { trades: [], format: null, skipped: [], preview, error: 'NO_HEADER' };
    format = found.format;
    col = { ...REPORTS[format][1] };
    sep = found.rows[0].sep;
    body = found.rows.map(({ row, cells }) => ({ row, cells }));
  }
  const mark = decimalMark(body.flatMap((b) => NUMBERS.filter((n) => n in col).map((n) => b.cells[col[n]])), sep);
  const trades = [], skipped = [...short], others = {};
  for (const { row, cells } of body) {
    const get = (name) => (name in col ? cells[col[name]] : undefined);
    const num = (name) => number(get(name), mark);
    const symbol = (get('symbol') || '').toUpperCase();
    if (symbol && !/XAU|GOLD/.test(symbol)) {
      skipped.push({ row, reason: 'NOT_GOLD' });
      others[symbol] = (others[symbol] || 0) + 1;                             // to name what the file holds instead
      continue;
    }
    const taxes = num('taxes');                                              // MT4 only: a tax is a cost like a commission
    const trade = {
      row, side: sideOf(get('side')),
      open: wallTime(get('open_time')), close: wallTime(get('close_time')), lots: num('lots'),
      entry: num('entry'), exit: num('exit'), stop: num('stop'),
      commission: Number.isFinite(taxes) && taxes !== 0 ? -(Math.abs(num('commission') || 0) + Math.abs(taxes)) : num('commission'),
      swap: num('swap'), profit: num('profit')
    };
    const bad = !trade.side ? 'SIDE' : !(trade.lots > 0) ? 'LOTS' : !(trade.entry > 0 && trade.exit > 0) ? 'PRICE'
      : !(Number.isFinite(trade.open) && Number.isFinite(trade.close)) ? 'TIME' : trade.close < trade.open ? 'TIME_ORDER'
        : format === 'template' || Number.isFinite(trade.profit) ? null
          // A report row with no result is an MT4 pending order that was cancelled; one that cannot be read is a fault.
          : (get('profit') || '') === '' ? 'NO_RESULT' : 'PROFIT';
    if (bad) skipped.push({ row, reason: bad }); else trades.push(trade);
  }
  const costs = ['commission', 'swap', 'profit'].filter((n) => n in col);
  return { trades, format, skipped, others, decimal: mark, costColumns: costs, preview, titled: Boolean(header),
    error: trades.length ? null : 'NO_TRADES' };
}

// ---------- MetaTrader 5's HTML report ----------

// A file's text from its bytes: UTF-16 (little or big endian, by its byte-order mark, as MT5 saves its
// HTML reports) or UTF-8.
export function decode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b.length >= 4 && b[0] !== 0 && b[1] === 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b);  // UTF-16 without a mark
  return new TextDecoder('utf-8').decode(b);
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
function cellText(html) {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name) => {
      if (name[0] === '#') {
        const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : all;
      }
      return ENTITIES[name.toLowerCase()] ?? all;
    }).replace(/[\t\r\n]+/g, ' ').trim();
}

// Every table row of an HTML page as one tab-separated line (a cell spanning n columns adds n - 1
// empty cells), so parseTable can find MT5's Positions header in it like in a pasted table.
export function htmlToTable(html) {
  const rows = [];
  for (const [, row] of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const [, attrs, inner] of row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|$)/gi)) {
      // MT5 keeps each position's comment in a hidden cell spanning 8 columns: what the page hides is not read.
      if (/\bclass\s*=\s*["']?[^"'>]*\bhidden\b/i.test(attrs) || /display\s*:\s*none/i.test(attrs)) continue;
      const span = Number((/colspan\s*=\s*["']?(\d+)/i.exec(attrs) || [])[1] || 1);
      cells.push(cellText(inner.replace(/<\/t[dh]>[\s\S]*$/i, '')), ...Array(Math.max(0, Math.min(span, 50) - 1)).fill(''));
    }
    if (cells.some((c) => c !== '')) rows.push(cells.join('\t'));
  }
  return rows.join('\n');
}

export const looksLikeHtml = (text) => /<table\b/i.test(String(text).slice(0, 200000));

// ---------- the settings ----------

const LIMITS = {
  spread: [0, 50, 1], slippage: [0, 50, 1], longRate: [-50, 50, 0.01], shortRate: [-50, 50, 0.01], ounces: [1, 100000, 1], tried: [1, 1e9, 1]
};

// Settings typed by the trader (strings, rates in % a year), checked: an empty, unreadable or
// out-of-range value is an error, never a silent zero.
export function settings(raw) {
  const options = { ...DEFAULTS, mode: raw.mode === 'real' ? 'real' : 'add', utc: Boolean(raw.utc) }, errors = [];
  for (const [name, [lo, hi, scale]] of Object.entries(LIMITS)) {
    const text = String(raw[name] ?? '').trim(), value = number(text, text.includes(',') && !text.includes('.') ? ',' : '.');
    if (text === '' || !Number.isFinite(value) || value < lo || value > hi) errors.push(name);
    else options[name] = name === 'tried' ? Math.round(value) : value * scale;
  }
  return { options, errors };
}

// ---------- nights held ----------

const NEW_YORK = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : null;

// A UTC instant as the wall clock of a server whose midnight is 17:00 New York (New York time + 7 hours).
export function serverClock(utcMs) {
  const parts = Object.fromEntries(NEW_YORK.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return local + 7 * 3600e3;
}

// Financing nights: one for each rollover on a weekday (the server midnight that ends Monday to
// Friday), three for the one that ends Wednesday, as MT5 charges gold.
export function nights(open, close, utc = false) {
  const a = utc ? serverClock(open) : open, b = utc ? serverClock(close) : close;
  const day = 86400e3;
  let count = 0;
  for (let t = Math.floor(a / day) * day + day; t <= b; t += day) {
    const ended = new Date(t - day).getUTCDay(); // 0 Sunday .. 6 Saturday: the day that just ended
    if (ended >= 1 && ended <= 5) count += ended === 3 ? 3 : 1;
  }
  return count;
}

// ---------- statistics ----------

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The inverse of the standard normal distribution (Acklam's rational approximation).
export function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p <= 0 || p >= 1) return NaN;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) return -invNorm(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function mean(x) { return x.reduce((s, v) => s + v, 0) / x.length; }
function sd(x) { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); }

// One-sided chance figure of a mean above zero, (hits + 1) / (draws + 1) so it is never zero, and the
// 95% interval of the mean, from the same seeded bootstrap of the values.
export function bootstrap(values, seed = SEED) {
  const n = values.length, m = mean(values);
  const resamples = Math.max(500, Math.min(5000, Math.floor(2e7 / n)));
  const random = mulberry32(seed), means = new Float64Array(resamples);
  let above = 0;
  for (let r = 0; r < resamples; r++) {
    let total = 0;
    for (let i = 0; i < n; i++) total += values[Math.floor(random() * n)];
    means[r] = total / n;
    if (means[r] - m >= m) above++;
  }
  means.sort();
  const at = (q) => means[Math.min(resamples - 1, Math.max(0, Math.round(q * (resamples - 1))))];
  return { p: (above + 1) / (resamples + 1), low: at(0.025), high: at(0.975), resamples };
}

export function tradesNeeded(m, s, tried = 1) {
  if (!(m > 0) || !(s > 0)) return null;
  const z = invNorm(1 - ALPHA / Math.max(1, tried)) + POWER_Z;
  return Math.ceil(z * z * (s / m) ** 2);
}

// ---------- the analysis ----------

export function analyse(trades, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const rows = trades.map((t) => {
    const sign = t.side === 'BUY' ? 1 : -1, oz = t.lots * o.ounces;
    const held = nights(t.open, t.close, o.utc);
    const fee = Number.isFinite(t.commission) ? Math.abs(t.commission) : 0;  // a commission is a cost, whatever its sign
    let gross, cost, doubled;  // doubled: every charge twice over, credits kept as they are
    if (o.mode === 'real') {
      const swap = Number.isFinite(t.swap) ? t.swap : 0;                       // swap keeps its sign: it may be a credit
      gross = Number.isFinite(t.profit) ? t.profit : sign * (t.exit - t.entry) * oz;
      cost = fee - swap;
      doubled = 2 * fee + (swap < 0 ? -2 * swap : -swap);
    } else {
      gross = sign * (t.exit - t.entry) * oz;
      const yearly = sign > 0 ? o.longRate : -o.shortRate;
      const fixed = (o.spread + 2 * o.slippage) * oz, financing = held * t.entry * oz * yearly / 360;
      cost = fixed + financing + fee;
      doubled = 2 * fixed + 2 * fee + (financing > 0 ? 2 * financing : financing);
    }
    const valid = o.useStops && Number.isFinite(t.stop) && t.stop > 0 && (sign > 0 ? t.stop < t.entry : t.stop > t.entry);
    const risk = valid ? Math.abs(t.entry - t.stop) * oz : null;
    return { ...t, nights: held, gross, cost, doubled, net: gross - cost, risk, hours: (t.close - t.open) / 3600e3 };
  });
  const n = rows.length;
  const inR = n > 0 && rows.every((r) => r.risk);
  const unit = inR ? 'R' : 'USD';
  const value = (r, field) => (inR ? r[field] / r.risk : r[field]);
  const net = rows.map((r) => value(r, 'net')), gross = rows.map((r) => value(r, 'gross')), cost = rows.map((r) => value(r, 'cost'));
  const out = { unit, trades: n, rows, options: o };
  if (n < 2) return { ...out, verdict: 'TOO_FEW', warnings: [] };
  const wins = rows.filter((r) => r.net > 0), losses = rows.filter((r) => r.net <= 0);
  const lossTotal = losses.reduce((s, r) => s + r.net, 0), winTotal = wins.reduce((s, r) => s + r.net, 0);
  const grossTotal = rows.reduce((s, r) => s + r.gross, 0), costTotal = rows.reduce((s, r) => s + r.cost, 0);
  const m = mean(net), s = sd(net), boot = bootstrap(net);
  const bar = ALPHA / Math.max(1, o.tried);
  const verdict = m <= 0 ? 'LOSING' : (n >= o.minTrades && boot.low > 0 && boot.p < bar) ? 'PROVEN' : 'NOT_PROVEN';
  const warnings = [];
  if (inR && Math.sign(m) !== Math.sign(grossTotal - costTotal) && grossTotal - costTotal !== 0) warnings.push('R_USD_DISAGREE');
  let g = 0, h = 0;
  return {
    ...out, verdict, bar, warnings,
    winRate: wins.length / n, averageWin: wins.length ? winTotal / wins.length : null,
    averageLoss: losses.length ? lossTotal / losses.length : null,
    profitFactor: lossTotal < 0 ? winTotal / -lossTotal : null,
    meanGross: mean(gross), meanCost: mean(cost), meanNet: m, sdNet: s,
    totalGross: grossTotal, totalCost: costTotal, totalNet: grossTotal - costTotal,
    meanNetDoubled: mean(rows.map((r) => value(r, 'gross') - value(r, 'doubled'))),
    totalNetDoubled: grossTotal - rows.reduce((s, r) => s + r.doubled, 0),
    costShare: grossTotal > 0 ? costTotal / grossTotal : null,
    p: boot.p, low: boot.low, high: boot.high, resamples: boot.resamples,
    needed: tradesNeeded(m, s, o.tried),
    medianHours: [...rows.map((r) => r.hours)].sort((a, b) => a - b)[Math.floor(n / 2)],
    curve: rows.map((r) => { g += value(r, 'gross'); h += value(r, 'net'); return { gross: g, net: h }; })  // in the result's unit
  };
}
