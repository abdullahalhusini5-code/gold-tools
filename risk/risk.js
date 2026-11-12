// Gold Day Risk: shows the day's note. It reads one file of its own site, data/note.json, and sends nothing.
// Every word that depends on the data is in TEXT, in English and Arabic; the fixed words are in each page.
const DATA = new URL('./data/note.json', import.meta.url);
const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';

const TEXT = {
  en: {
    day: (date) => `Trading day ending ${date}, 17:00 New York`,
    usd: (n) => `about $${n} an ounce`,
    level: { SAME: 'About the same as the past month', CALMER: 'Calmer than the past month', WILDER: 'Wilder than the past month' },
    made: (when, hours) => `Made ${when}, about ${hours} into the trading day.`,
    early: (when) => `Made ${when}, before the trading day begins.`,
    hours: (n) => (n < 1 ? 'less than an hour' : n === 1 ? '1 hour' : `${num(n)} hours`),
    reason: {
      STALE: 'The newest complete session is not the one before today. The last session was short or a holiday, or today’s data has not been read yet.',
      NO_HISTORY: 'There is not enough verified history to make a forecast.',
      LOAD: 'Today’s note could not be loaded. Try again in a few minutes.',
    },
    closer: (k, n) => `${k} of ${n}`,
    few: (n) => `Only ${num(n)} ${n === 1 ? 'day' : 'days'} so far: far too few to judge. The model’s real test was on 2020 to 2026 history.`,
    ahead: 'before the day ended', later: 'computed later', none: 'no result', empty: 'No finished day yet.',
    revised: (days) => `A later read of the data gives a different forecast for: ${days}. The record keeps the number that was published.`,
  },
  ar: {
    day: (date) => `يوم التداول المنتهي ${date}، الساعة 17:00 بتوقيت نيويورك`,
    usd: (n) => `نحو ${n} دولارًا للأونصة`,
    level: { SAME: 'قريب من مستوى الشهر الماضي', CALMER: 'أهدأ من الشهر الماضي', WILDER: 'أشد تقلبًا من الشهر الماضي' },
    made: (when, hours) => `أُعدّ ${when}، بعد ${hours} من بداية يوم التداول.`,
    early: (when) => `أُعدّ ${when}، قبل بداية يوم التداول.`,
    hours: (n) => (n < 1 ? 'أقل من ساعة' : n === 1 ? 'ساعة واحدة' : n === 2 ? 'ساعتين' : n <= 10 ? `${num(n)} ساعات` : `${num(n)} ساعة`),
    reason: {
      STALE: 'آخر جلسة مكتملة ليست الجلسة السابقة لليوم. كانت الجلسة الأخيرة قصيرة أو عطلة، أو لم تُقرأ بيانات اليوم بعد.',
      NO_HISTORY: 'لا توجد بيانات موثّقة كافية لإعداد توقّع.',
      LOAD: 'تعذّر تحميل مذكرة اليوم. حاول مرة أخرى بعد دقائق.',
    },
    closer: (k, n) => `${k} من ${n}`,
    few: (n) => `${n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${num(n)} أيام` : `${num(n)} يومًا`} فقط حتى الآن: عدد قليل جدًا للحكم. الاختبار الحقيقي للنموذج كان على بيانات 2020 إلى 2026.`,
    ahead: 'قبل نهاية اليوم', later: 'حُسب لاحقًا', none: 'لا نتيجة', empty: 'لا يوم مكتمل بعد.',
    revised: (days) => `تعطي قراءة لاحقة للبيانات توقّعًا مختلفًا للأيام التالية: ${days}. يحتفظ السجل بالرقم الذي نُشر.`,
  },
}[lang];

const $ = (id) => document.getElementById(id);
// Western digits in both languages; in Arabic they are isolated so a number keeps its order inside the sentence.
const num = (text) => (lang === 'ar' ? `⁦${text}⁩` : String(text));
const pct = (value) => num(`${value.toFixed(2)}%`);
const dayFormat = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const whenFormat = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const dayName = (day) => dayFormat.format(new Date(`${day}T00:00:00Z`));

function cell(row, text, numeric) {
  const td = document.createElement('td');
  td.textContent = text;
  if (numeric) td.className = 'num';
  row.append(td);
}

function show(note) {
  // A note that was not renewed is never shown as today's: once its day has closed, there is no forecast.
  const live = note.status === 'FORECAST' && Date.now() < Date.parse(note.closes);
  $('forecast').hidden = !live;
  $('none').hidden = live;
  if (live) {
    $('day').textContent = TEXT.day(dayName(note.day));
    $('hero').textContent = pct(note.forecast_pct);
    $('usd').textContent = TEXT.usd(num(note.forecast_usd));
    $('level').textContent = TEXT.level[note.level];
    $('t-forecast').textContent = pct(note.forecast_pct);
    $('t-usual').textContent = pct(note.usual_pct);
    $('t-atr').textContent = pct(note.atr_pct);
    const into = (Date.parse(note.made_at) - Date.parse(note.begins)) / 3600000;
    const when = whenFormat.format(new Date(note.made_at));
    $('made').textContent = into < 0 ? TEXT.early(when) : TEXT.made(when, TEXT.hours(Math.round(into)));
  } else {
    $('none-why').textContent = TEXT.reason[note.status === 'FORECAST' ? 'STALE' : note.reason] || TEXT.reason.NO_HISTORY;
  }
  const score = note.score || { days: 0 };
  $('scores').hidden = !score.days;
  if (score.days) {
    $('s-days').textContent = num(score.days);
    $('s-model').textContent = num(`${score.model_miss_pct.toFixed(1)}%`);
    $('s-atr').textContent = num(`${score.atr_miss_pct.toFixed(1)}%`);
    $('s-closer').textContent = TEXT.closer(num(score.model_closer), num(score.days));
  }
  $('s-note').textContent = score.days ? (score.days < 20 ? TEXT.few(score.days) : '') : TEXT.empty;
  $('s-note').hidden = !$('s-note').textContent;
  const body = $('rows');
  body.replaceChildren();
  for (const item of [...(note.record || [])].reverse()) {
    const row = document.createElement('tr');
    cell(row, dayName(item.day));
    cell(row, pct(item.forecast_pct), true);
    cell(row, pct(item.atr_pct), true);
    cell(row, item.actual_pct === null ? TEXT.none : pct(item.actual_pct), true);
    cell(row, item.ahead ? TEXT.ahead : TEXT.later);
    body.append(row);
  }
  $('table').hidden = !(note.record || []).length;
  const revised = note.revised || [];
  $('revised').hidden = !revised.length;
  $('revised').textContent = revised.length ? TEXT.revised(revised.map(dayName).join(lang === 'ar' ? '، ' : ', ')) : '';
  $('sha').textContent = (note.model_sha256 || '').slice(0, 12);
}

fetch(DATA, { cache: 'no-store' })
  .then((found) => (found.ok ? found.json() : Promise.reject(new Error(String(found.status)))))
  .then(show)
  .catch(() => {
    $('forecast').hidden = true;
    $('none').hidden = false;
    $('none-why').textContent = TEXT.reason.LOAD;
    $('scores').hidden = true;
    $('table').hidden = true;
    $('s-note').hidden = true;
  });
