// Gold Reality Check: the page logic shared by the English and Arabic pages. Every word shown comes
// from TEXT, picked by <html lang>. Numbers use Western digits in both languages; in Arabic each
// number is wrapped in a left-to-right isolate so signs and units stay in place.
import { analyse, decode, htmlToTable, looksLikeHtml, parseTable, settings } from './checker.js';

const LANG = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const SITE = 'https://abdullahalhusini5-code.github.io/gold-tools/checker/';
const SAMPLE = new URL('./sample.csv', import.meta.url);
const ISSUES = 'https://github.com/abdullahalhusini5-code/gold-tools/issues/new';
const num = (v, o) => v.toLocaleString('en-US', o);
// Arabic-Indic and Persian digits, and the Arabic decimal and thousands marks, as typed on Arabic keyboards.
const latin = (s) => String(s).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).replace(/\u066B/g, '.').replace(/\u066C/g, ',');
const iso = (s) => (LANG === 'ar' ? `⁦${s}⁩` : s);

const TEXT = {
  en: {
    names: { spread: 'spread', slippage: 'slippage', longRate: 'long financing', shortRate: 'short financing', ounces: 'ounces in one lot', tried: 'strategies tried' },
    reasons: { NOT_GOLD: 'not gold', TIME_ORDER: 'closes before it opens', SIDE: 'no buy or sell', LOTS: 'no lot size', PRICE: 'unreadable price', TIME: 'unreadable time', SHORT_ROW: 'too few cells',
      BALANCE: 'a deposit or withdrawal', TOTALS: 'a totals line', NO_RESULT: 'no result: an order, not a trade', PROFIT: 'unreadable profit' },
    titles: { PROVEN: 'Proven after costs', NOT_PROVEN: 'Not proven: it could be luck', LOSING: 'Losing after costs', TOO_FEW: 'Too few trades to judge' },
    proven: (net, ch) => `After every cost these trades made ${net} a trade, and a strategy with no edge would do this well only ${ch}. That is a record of the past, not a promise: watch it on new trades before you risk more.`,
    notProven: (net, ch, few, n) => `After costs these trades made ${net} a trade, but a strategy with no edge would do as well ${ch}${few ? `, and ${n} trades are too few to judge` : ''}.`,
    neededMany: 'More than 100,000 trades of this kind would be needed to tell, so it cannot be told apart from luck.',
    needed: (n) => `About ${n} trades of this kind would be needed to tell.`,
    losingGross: (g, c, n) => `Before costs these trades made ${g} a trade, but costs took ${c}, so after costs they lost ${n} a trade.`,
    losingAll: (g, n) => `These trades lost money even before costs: ${g} a trade, and ${n} after costs.`,
    tooFew: 'Load at least two trades. A fair judgement needs 200 or more.',
    lessThousand: 'less than 1 time in 1,000', nearlyEvery: 'nearly every time', oneIn: (n) => `about 1 time in ${n}`,
    tiles: {
      trades: 'Trades', won: (p) => `${p} won after costs`,
      gross: 'Before costs, per trade', grossReal: 'commission and swap added back', grossAdd: 'from the prices alone',
      cost: 'Costs, per trade', share: (p) => `${p} of the profit before costs`, costReal: 'commission and swap', costAdd: 'spread, slippage, financing',
      net: 'After costs, per trade', interval: (a, b) => `${iso('95%')} interval ${a} to ${b}`,
      chance: 'Chance with no edge', bar: (b) => `bar: ${b}`,
      needed: 'Trades needed to tell', power: 'at 80% power', none: 'no positive result to confirm'
    },
    rows: {
      unit: 'Results in', unitR: 'R, the amount risked to each stop', unitUSD: 'US dollars',
      totalGross: 'Total before costs', totalCost: 'Total costs', totalNet: 'Total after costs',
      twiceReal: 'commission and swap charges doubled', twiceAdd: 'costs doubled (credits kept)',
      doubledEach: (t) => `After ${t}, per trade`, doubledTotal: (t) => `Total after ${t}`,
      winLoss: 'Average win / average loss, after costs', factor: 'Profit factor, after costs',
      held: 'Median time held', minutes: (m) => `${m} minutes`, hours: (h) => `${h} hours`,
      nights: 'Financing nights charged', fromFile: 'from your file',
      format: 'File read as', mt5: 'MetaTrader 5 Positions table', mt4: 'MetaTrader 4 Closed Transactions table', template: 'template columns',
      decimal: 'Decimal mark in the file', comma: 'comma', point: 'point',
      draws: 'Re-draws for the chance figure',
      mode: 'Checked as', modeReal: 'real account history (costs from the file)', modeAdd: 'back-test, paper or signal trades (costs added)',
      costs: 'Costs used', costsText: (s, l, a, b) => `spread ${s}, slippage ${l} a side, longs pay ${a} and shorts receive ${b} a year`,
      misc: 'Ounces in one lot · times · strategies tried', utc: 'UTC', server: 'MetaTrader server time'
    },
    notes: {
      reportMode: 'This is a MetaTrader account report, so its prices already include the spread. It is checked as real account history, with its own commission and swap.',
      reportStops: 'Results are in dollars: MetaTrader reports each stop as it stood at the close, so it cannot show what was first risked.',
      noCosts: 'Your file has no commission, swap or profit column, so no cost is taken off. If your account pays any, the result looks better than it was.',
      disagree: 'The result in R and the result in dollars point different ways, usually because stops of very different sizes were used. Read both before deciding.',
      untitled: 'The column titles were not recognised (perhaps another language), so the trades were found by their content: a MetaTrader time, buy or sell, a volume and prices.'
    },
    errors: {
      empty: 'Choose a file, paste a table, or try the example.',
      preview: (lines) => `The column titles it read: “${lines[0]}”.`,
      noHeader: 'No header row was found. The first rows need the template\'s column names, the Positions header of a MetaTrader 5 report, or the Closed Transactions header of a MetaTrader 4 statement.',
      noTrades: (s) => `No gold trades could be read. ${s}`,
      noGold: (n, list) => `This file has no gold trades: its ${n} trade${n === '1' ? ' is' : 's are'} in ${list}. Reality Check checks gold (XAUUSD or GOLD) only.`,
      settings: (list) => `Please check these settings: ${list}.`,
      sample: 'The example could not be loaded.'
    },
    skipped: (count, shown, more) => `${count} row${count > 1 ? 's' : ''} set aside: ${shown}${more ? ', …' : ''}.`,
    row: (r, why) => `row ${r} (${why})`,
    tradeN: (n) => `trade ${n}`, chartLabel: (n) => `Cumulative result over ${n} trades, before and after costs`,
    tip: (i, g, n) => `Trade ${i}<br>Before costs: ${g}<br>After costs: ${n}`,
    example: 'Example: a made-up intraday system, 260 trades',
    andOthers: ' and others',
    issueTitle: 'Reality Check could not read my file',
    issueBody: '**What happened** (the first sentence of the message the page showed):\n\n\n**The column titles** (the first row of the Positions or Closed Transactions table, nothing below it):\n\n\n**MetaTrader 4 or 5, its language** (set under View, then Languages) **and version**:\n\n\nPlease do not paste the report or any line with your name, account number or trades.',
    printed: (date) => `Report made with Gold Reality Check (${SITE}) on ${date}. Educational tool, not investment advice.`,
    locale: undefined
  },
  ar: {
    names: { spread: 'الفارق السعري', slippage: 'الانزلاق السعري', longRate: 'تمويل الشراء', shortRate: 'تمويل البيع', ounces: 'أونصات اللوت', tried: 'الاستراتيجيات المجرّبة' },
    reasons: { NOT_GOLD: 'ليست ذهبًا', TIME_ORDER: 'تُغلق قبل أن تُفتح', SIDE: 'لا شراء ولا بيع', LOTS: 'لا حجم للّوت', PRICE: 'سعر غير مقروء', TIME: 'وقت غير مقروء', SHORT_ROW: 'خلايا ناقصة',
      BALANCE: 'إيداع أو سحب', TOTALS: 'سطر إجماليات', NO_RESULT: 'لا نتيجة: أمر وليس صفقة', PROFIT: 'ربح غير مقروء' },
    titles: { PROVEN: 'مُثبتة بعد التكاليف', NOT_PROVEN: 'غير مُثبتة: قد يكون مجرد حظ', LOSING: 'خاسرة بعد التكاليف', TOO_FEW: 'عدد الصفقات أقل من أن يُحكم عليه' },
    proven: (net, ch) => `بعد كل التكاليف حققت هذه الصفقات ${net} للصفقة، ولا تحقق استراتيجيةٌ بلا أفضلية حقيقية نتيجةً كهذه إلا ${ch}. هذا سجلٌّ للماضي وليس وعدًا: راقبها على صفقات جديدة قبل أن تخاطر بالمزيد.`,
    notProven: (net, ch, few, n) => `بعد التكاليف حققت هذه الصفقات ${net} للصفقة، لكن استراتيجيةً بلا أفضلية حقيقية تحقق مثل ذلك ${ch}${few ? `، و${n} صفقة عددٌ أقل من أن يُحكم عليه` : ''}.`,
    neededMany: 'سيلزم أكثر من 100,000 صفقة من هذا النوع للحكم عليها، أي أنه لا يمكن تمييزها عن الحظ.',
    needed: (n) => `سيلزم نحو ${n} صفقة من هذا النوع للحكم عليها.`,
    losingGross: (g, c, n) => `قبل التكاليف حققت هذه الصفقات ${g} للصفقة، لكن التكاليف أخذت ${c}، فخسرت بعد التكاليف ${n} للصفقة.`,
    losingAll: (g, n) => `خسرت هذه الصفقات حتى قبل التكاليف: ${g} للصفقة، و${n} بعد التكاليف.`,
    tooFew: 'حمّل صفقتين على الأقل. الحكم العادل يحتاج إلى 200 صفقة أو أكثر.',
    lessThousand: 'في أقل من مرة واحدة من كل 1,000 مرة', nearlyEvery: 'في كل مرة تقريبًا', oneIn: (n) => `في نحو مرة واحدة من كل ${n} مرة`,
    tiles: {
      trades: 'الصفقات', won: (p) => `${p} منها رابحة بعد التكاليف`,
      gross: 'قبل التكاليف، للصفقة', grossReal: 'مع ردّ العمولة والسواب إلى النتيجة', grossAdd: 'من الأسعار وحدها',
      cost: 'التكاليف، للصفقة', share: (p) => `${p} من الربح قبل التكاليف`, costReal: 'العمولة والسواب', costAdd: 'الفارق والانزلاق والتمويل',
      net: 'بعد التكاليف، للصفقة', interval: (a, b) => `مجال الثقة ${iso('95%')}: من ${a} إلى ${b}`,
      chance: 'الاحتمال دون أفضلية حقيقية', bar: (b) => `الحدّ: ${b}`,
      needed: 'الصفقات اللازمة للحكم', power: `بقوة اختبار ${iso('80%')}`, none: 'لا نتيجة موجبة لتأكيدها'
    },
    rows: {
      unit: 'وحدة النتائج', unitR: 'R، أي المبلغ المخاطَر به حتى وقف الخسارة', unitUSD: 'الدولار الأمريكي',
      totalGross: 'الإجمالي قبل التكاليف', totalCost: 'إجمالي التكاليف', totalNet: 'الإجمالي بعد التكاليف',
      twiceReal: 'مضاعفة رسوم العمولة والسواب', twiceAdd: 'مضاعفة التكاليف (مع إبقاء التمويل المقبوض كما هو)',
      doubledEach: (t) => `بعد ${t}، للصفقة`, doubledTotal: (t) => `الإجمالي بعد ${t}`,
      winLoss: 'متوسط الربح / متوسط الخسارة بعد التكاليف', factor: 'عامل الربح بعد التكاليف',
      held: 'وسيط مدة الاحتفاظ بالصفقة', minutes: (m) => `${m} دقيقة`, hours: (h) => `${h} ساعة`,
      nights: 'ليالي التمويل المحتسبة', fromFile: 'من ملفك',
      format: 'قُرئ الملف على أنه', mt5: 'جدول المراكز من MetaTrader 5', mt4: 'جدول الصفقات المغلقة من MetaTrader 4', template: 'أعمدة القالب',
      decimal: 'الفاصلة العشرية في الملف', comma: 'فاصلة', point: 'نقطة',
      draws: 'عدد إعادات السحب لحساب الاحتمال',
      mode: 'نوع الفحص', modeReal: 'سجل حساب حقيقي (التكاليف من الملف)', modeAdd: 'صفقات اختبار تاريخي أو تجريبية أو إشارات (أُضيفت التكاليف)',
      costs: 'التكاليف المستخدمة', costsText: (s, l, a, b) => `الفارق ${s}، والانزلاق ${l} لكل جهة، ويدفع الشراء ${a} ويقبض البيع ${b} سنويًا`,
      misc: 'أونصات اللوت · التوقيت · الاستراتيجيات المجرّبة', utc: 'UTC', server: 'توقيت خادم MetaTrader'
    },
    notes: {
      reportMode: 'هذا تقرير حساب من MetaTrader، وأسعاره تتضمن الفارق السعري أصلًا، لذلك فُحص كسجل حساب حقيقي بعمولته وسوابه.',
      reportStops: 'النتائج بالدولار: يسجّل MetaTrader وقف الخسارة كما كان عند الإغلاق، فلا يُظهر المبلغ المخاطَر به في البداية.',
      noCosts: 'لا يحتوي ملفك على عمود للعمولة أو السواب أو الربح، فلم تُخصم أي تكلفة. إن كان حسابك يدفع شيئًا منها فالنتيجة تبدو أفضل مما كانت فعلًا.',
      disagree: 'النتيجة بوحدة R والنتيجة بالدولار تشيران إلى اتجاهين مختلفين، غالبًا بسبب أحجام وقف خسارة متفاوتة جدًا. اقرأ الاثنتين قبل أن تقرر.',
      untitled: 'لم يُتعرّف على عناوين الأعمدة (ربما لأنها بلغة أخرى)، لذلك عُثر على الصفقات من محتواها: وقت بصيغة MetaTrader، وشراء أو بيع، وحجم وأسعار.'
    },
    errors: {
      empty: 'اختر ملفًا أو الصق جدولًا أو جرّب المثال.',
      preview: (lines) => `عناوين الأعمدة التي قُرئت: «${lines[0]}».`,
      noHeader: 'لم يُعثر على صف العناوين. يجب أن تحتوي الصفوف الأولى على أسماء أعمدة القالب، أو عناوين جدول المراكز في تقرير MetaTrader 5، أو عناوين جدول الصفقات المغلقة في كشف MetaTrader 4.',
      noTrades: (s) => `تعذّرت قراءة أي صفقة ذهب. ${s}`,
      noGold: (n, list) => `لا صفقات ذهب في هذا الملف: صفقاته (${n}) على ${list}. فحص الواقع يفحص الذهب فقط (XAUUSD أو GOLD).`,
      settings: (list) => `يرجى مراجعة هذه الإعدادات: ${list}.`,
      sample: 'تعذّر تحميل المثال.'
    },
    skipped: (count, shown, more) => `صفوف مستبعدة (${count}): ${shown}${more ? '، …' : ''}.`,
    row: (r, why) => `الصف ${r} (${why})`,
    tradeN: (n) => `الصفقة ${n}`, chartLabel: (n) => `النتيجة التراكمية على ${n} صفقة، قبل التكاليف وبعدها`,
    tip: (i, g, n) => `الصفقة ${i}<br>قبل التكاليف: ${g}<br>بعد التكاليف: ${n}`,
    example: 'مثال: نظام تداول يومي مختلَق، 260 صفقة',
    andOthers: ' وغيرها',
    issueTitle: 'تعذّر على فحص الواقع قراءة ملفي',
    issueBody: '**ما الذي حدث** (الجملة الأولى من الرسالة التي أظهرتها الصفحة):\n\n\n**عناوين الأعمدة** (الصف الأول من جدول المراكز أو الصفقات المغلقة فقط، دون ما تحته):\n\n\n**MetaTrader 4 أو 5، ولغته** (من قائمة View ثم Languages) **وإصداره**:\n\n\nيُرجى عدم لصق التقرير أو أي سطر فيه اسمك أو رقم حسابك أو صفقاتك.',
    printed: (date) => `تقرير من Gold Reality Check (${SITE}ar/) بتاريخ ${date}. أداة تعليمية وليست نصيحة استثمارية.`,
    locale: 'ar-u-nu-latn'
  }
};
const T = TEXT[LANG];

const $ = (id) => document.getElementById(id);
const FIELDS = ['spread', 'slippage', 'longRate', 'shortRate', 'ounces', 'tried'];
let text = '';
const ICONS = {
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>',
  bad: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  muted: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'
};
const TONES = { PROVEN: 'ok', NOT_PROVEN: 'warn', LOSING: 'bad', TOO_FEW: 'muted' };

function fmt(v, unit, signed) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const sign = v < 0 ? '−' : v > 0 && signed ? '+' : '';
  if (unit === 'R') return iso(`${sign}${Math.abs(v).toFixed(3)} R`);
  return iso(`${sign}$${num(Math.abs(v), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}
function chance(p) {
  if (p < 0.001) return T.lessThousand;
  const one = Math.round(1 / p);
  return one <= 1 ? T.nearlyEvery : T.oneIn(iso(num(one)));
}
function sentence(r) {
  if (r.verdict === 'PROVEN') return T.proven(fmt(r.meanNet, r.unit), chance(r.p));
  if (r.verdict === 'NOT_PROVEN') {
    const tail = r.needed ? ` ${r.needed > 1e5 ? T.neededMany : T.needed(iso(num(r.needed)))}` : '';
    return T.notProven(fmt(r.meanNet, r.unit), chance(r.p), r.trades < r.options.minTrades, iso(num(r.trades))) + tail;
  }
  if (r.verdict === 'LOSING') return r.meanGross > 0 ? T.losingGross(fmt(r.meanGross, r.unit), fmt(r.meanCost, r.unit), fmt(-r.meanNet, r.unit)) : T.losingAll(fmt(r.meanGross, r.unit), fmt(r.meanNet, r.unit));
  return T.tooFew;
}
function readSettings() {
  const raw = Object.fromEntries(FIELDS.map((f) => [f, latin($(f).value)]));
  const found = settings({ ...raw, mode: document.querySelector('input[name=mode]:checked').value, utc: $('utc').checked });
  FIELDS.forEach((f) => $(f).setAttribute('aria-invalid', String(found.errors.includes(f))));
  return found;
}
function tile(label, value, note) {
  return `<div class="tile"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
}

function chart(curve, unit) {
  const box = $('chart');
  const w = Math.max(320, Math.round(box.clientWidth || 900)), h = Math.round(Math.min(360, Math.max(220, w * 0.42)));
  const pad = { l: 64, r: 12, t: 10, b: 30 }, n = curve.length;
  const all = curve.flatMap((c) => [c.gross, c.net]).concat([0]);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i) => pad.l + (n === 1 ? 0 : i / (n - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (hi - v) / span * (h - pad.t - pad.b);
  const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const nice = [1, 2, 5, 10].map((k) => k * step).find((s) => span / s <= 6) || step * 10;
  let grid = '';
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) {
    grid += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v) < 1e-9 ? 'var(--muted)' : 'var(--grid)'}" stroke-width="1"/>`;
    grid += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${unit === 'R' ? `${+v.toFixed(2)} R` : `$${num(Math.round(v))}`}</text>`;
  }
  const line = (k) => curve.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c[k]).toFixed(1)}`).join('');
  box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${T.chartLabel(n)}">
    ${grid}<text x="${w - pad.r}" y="${h - 8}" text-anchor="end" font-size="11" fill="var(--muted)">${T.tradeN(n)}</text>
    <text x="${pad.l}" y="${h - 8}" font-size="11" fill="var(--muted)">${T.tradeN(1)}</text>
    <path d="${line('gross')}" fill="none" stroke="var(--series-1)" stroke-width="2"/>
    <path d="${line('net')}" fill="none" stroke="var(--series-0)" stroke-width="2"/>
    <line id="cross" y1="${pad.t}" y2="${h - pad.b}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>
    <circle id="dot-g" r="4" fill="var(--series-1)" stroke="var(--panel)" stroke-width="2" visibility="hidden"/>
    <circle id="dot-n" r="4" fill="var(--series-0)" stroke="var(--panel)" stroke-width="2" visibility="hidden"/>
    <rect x="${pad.l}" y="0" width="${w - pad.l - pad.r}" height="${h}" fill="transparent" id="hit"/></svg><div class="tip" id="tip" dir="${LANG === 'ar' ? 'rtl' : 'ltr'}" hidden></div>`;
  const svg = box.querySelector('svg'), tip = $('tip'), el = (id) => svg.getElementById(id);
  const show = (event) => {
    const r = svg.getBoundingClientRect(), px = (event.clientX - r.left) * (w / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.round((px - pad.l) / (w - pad.l - pad.r) * (n - 1))));
    ['cross', 'dot-g', 'dot-n'].forEach((id) => el(id).setAttribute('visibility', 'visible'));
    el('cross').setAttribute('x1', x(i)); el('cross').setAttribute('x2', x(i));
    el('dot-g').setAttribute('cx', x(i)); el('dot-g').setAttribute('cy', y(curve[i].gross));
    el('dot-n').setAttribute('cx', x(i)); el('dot-n').setAttribute('cy', y(curve[i].net));
    tip.hidden = false;
    tip.innerHTML = T.tip(i + 1, fmt(curve[i].gross, unit), fmt(curve[i].net, unit));
    tip.style.left = `${Math.min(x(i) / w * r.width + 12, r.width - tip.offsetWidth - 4)}px`; tip.style.top = '8px';
  };
  const hide = () => { tip.hidden = true; ['cross', 'dot-g', 'dot-n'].forEach((id) => el(id).setAttribute('visibility', 'hidden')); };
  el('hit').addEventListener('pointermove', show);
  el('hit').addEventListener('pointerleave', hide);
}

function skippedText(skipped) {
  if (!skipped.length) return '';
  const shown = skipped.slice(0, 8).map((s) => T.row(s.row, T.reasons[s.reason] || s.reason)).join(LANG === 'ar' ? '، ' : ', ');
  return T.skipped(skipped.length, shown, skipped.length > 8);
}

let last = null;
function render(found, parsed, notes) {
  last = found;
  const tone = TONES[found.verdict];
  $('verdict').className = `verdict ${tone}`;
  $('verdict-icon').innerHTML = ICONS[tone];
  $('verdict-title').textContent = T.titles[found.verdict];
  $('verdict-text').textContent = sentence(found);
  $('notes').replaceChildren(...notes.map((note) => Object.assign(document.createElement('li'), { textContent: note })));
  $('printed').textContent = T.printed(new Date().toLocaleString(T.locale));
  $('results').hidden = false;
  ['numbers', 'curve', 'details'].forEach((id) => { $(id).hidden = found.verdict === 'TOO_FEW'; });
  if (found.verdict === 'TOO_FEW') return;
  const u = found.unit, o = found.options, real = o.mode === 'real', K = T.tiles, R = T.rows;
  const twice = real ? R.twiceReal : R.twiceAdd;
  $('numbers').innerHTML = [
    tile(K.trades, iso(num(found.trades)), K.won(iso(`${Math.round(found.winRate * 100)}%`))),
    tile(K.gross, fmt(found.meanGross, u, true), real ? K.grossReal : K.grossAdd),
    tile(K.cost, fmt(found.meanCost, u), found.costShare !== null ? K.share(iso(`${Math.round(found.costShare * 100)}%`)) : (real ? K.costReal : K.costAdd)),
    tile(K.net, fmt(found.meanNet, u, true), K.interval(fmt(found.low, u, true), fmt(found.high, u, true))),
    tile(K.chance, iso(found.p < 0.001 ? '< 0.001' : found.p.toFixed(3)), K.bar(iso(found.bar.toPrecision(2)))),
    tile(K.needed, !found.needed ? '–' : iso(found.needed > 1e5 ? '> 100,000' : num(found.needed)), found.needed ? K.power : K.none)
  ].join('');
  chart(found.curve, u);
  const nights = found.rows.reduce((s, r) => s + r.nights, 0);
  const pct = (v) => iso(`${(v * 100).toFixed(2)}%`);
  const rows = [
    [R.unit, u === 'R' ? R.unitR : R.unitUSD],
    [R.totalGross, fmt(found.totalGross, 'USD')],
    [R.totalCost, fmt(found.totalCost, 'USD')],
    [R.totalNet, fmt(found.totalNet, 'USD')],
    [R.doubledEach(twice), fmt(found.meanNetDoubled, u, true)],
    [R.doubledTotal(twice), fmt(found.totalNetDoubled, 'USD')],
    [R.winLoss, `${fmt(found.averageWin, 'USD')} / ${fmt(found.averageLoss, 'USD')}`],
    [R.factor, found.profitFactor ? iso(found.profitFactor.toFixed(2)) : '–'],
    [R.held, found.medianHours < 1 ? R.minutes(iso(Math.round(found.medianHours * 60))) : R.hours(iso(found.medianHours.toFixed(1)))],
    [R.nights, real ? R.fromFile : iso(num(nights))],
    [R.format, R[parsed.format] || R.template],
    [R.decimal, parsed.decimal === ',' ? R.comma : R.point],
    [R.draws, iso(num(found.resamples))],
    [R.mode, real ? R.modeReal : R.modeAdd],
    ...(real ? [] : [[R.costs, R.costsText(iso(`$${o.spread.toFixed(2)}`), iso(`$${o.slippage.toFixed(2)}`), pct(o.longRate), pct(o.shortRate))]]),
    [R.misc, `${iso(o.ounces)} · ${o.utc ? R.utc : R.server} · ${iso(o.tried)}`]
  ];
  $('table').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('skipped').textContent = skippedText(parsed.skipped);
}

function fail(message) {
  $('error').textContent = message;
  $('report').hidden = false;
}

function run(scroll) {
  $('error').textContent = '';
  $('report').hidden = true;
  let source = latin($('paste').value.trim() || text);
  if (looksLikeHtml(source)) source = htmlToTable(source);  // MT5's HTML report, as saved or pasted
  if (!source) { $('error').textContent = T.errors.empty; return; }
  const parsed = parseTable(source);
  const others = Object.entries(parsed.others || {}).sort((a, b) => b[1] - a[1]);
  const read = parsed.skipped.every((s) => ['NOT_GOLD', 'BALANCE', 'TOTALS', 'NO_RESULT'].includes(s.reason));
  if (parsed.error === 'NO_TRADES' && others.length && read) {     // read well, but not gold: no problem to report
    const list = others.slice(0, 4).map(([s]) => iso(s)).join(LANG === 'ar' ? '، ' : ', ') + (others.length > 4 ? T.andOthers : '');
    $('error').textContent = T.errors.noGold(iso(num(others.reduce((n, [, c]) => n + c, 0))), list);
    return;
  }
  if (parsed.error) {
    const why = parsed.error === 'NO_HEADER' ? T.errors.noHeader : T.errors.noTrades(skippedText(parsed.skipped));
    fail(parsed.preview && parsed.preview.length ? `${why} ${T.errors.preview(parsed.preview)}` : why);
    return;
  }
  const notes = [], report = parsed.format === 'mt5' || parsed.format === 'mt4';  // a MetaTrader account report
  if (report && document.querySelector('input[name=mode]:checked').value === 'add') {
    document.querySelector('input[name=mode][value=real]').checked = true;
    notes.push(T.notes.reportMode);
  }
  const { options, errors } = readSettings();
  if (errors.length) { $('error').textContent = T.errors.settings(errors.map((e) => T.names[e]).join(LANG === 'ar' ? '، ' : ', ')); return; }
  options.useStops = !report;  // MetaTrader reports the stop in force at close, which may have been moved
  if (report) notes.push(T.notes.reportStops);
  if (report && parsed.titled === false) notes.push(T.notes.untitled);
  if (options.mode === 'real' && !parsed.costColumns.length) notes.push(T.notes.noCosts);
  const found = analyse(parsed.trades, options);
  if (found.warnings.includes('R_USD_DISAGREE')) notes.push(T.notes.disagree);
  render(found, parsed, notes);
  if (scroll) $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('report').href = `${ISSUES}?${new URLSearchParams({ title: T.issueTitle, body: T.issueBody })}`;
$('choose').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  text = decode(await file.arrayBuffer());  // MT5 saves its HTML report in UTF-16
  $('paste').value = '';
  $('file-name').textContent = file.name;
  run(true);
});
$('sample').addEventListener('click', async () => {
  try {
    text = await (await fetch(SAMPLE)).text();
  } catch (e) { $('error').textContent = T.errors.sample; return; }
  $('paste').value = '';
  document.querySelector('input[name=mode][value=add]').checked = true;
  $('file-name').textContent = T.example;
  run(true);
});
$('template').addEventListener('click', () => {
  const csv = 'open_time,close_time,side,lots,entry,exit,stop,commission\n2026-03-02 10:00,2026-03-02 12:30,BUY,0.10,2900.50,2906.20,2895.00,0\n';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'gold-trades-template.csv' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('run').addEventListener('click', () => run(true));
$('print').addEventListener('click', () => window.print());
document.querySelectorAll('input[name=mode], .settings input').forEach((el) => el.addEventListener('change', () => { if (last) run(false); }));
let width = window.innerWidth;
window.addEventListener('resize', () => { if (last && Math.abs(window.innerWidth - width) > 40) { width = window.innerWidth; chart(last.curve, last.unit); } });
