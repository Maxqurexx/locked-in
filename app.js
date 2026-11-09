// Locked In: a work-time tracker. Every tap on the big button starts or stops a session; a session
// that runs over midnight counts toward both days. Everything lives in this phone's localStorage.

const KEY = 'lockedin.v1';
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const RING = 2 * Math.PI * 96;
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const QUOTES = [
  'Дисциплина - это делать, когда не хочется.',
  'Пока ты отдыхаешь, кто-то тренируется.',
  'Один час фокуса лучше трёх часов «почти работы».',
  'Ты не должен быть мотивирован. Ты должен быть последователен.',
  'Маленькие шаги каждый день, большие результаты через год.',
  'Сложно сейчас, легко потом.',
  'Не ломай цепочку.',
];
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const $ = id => document.getElementById(id);
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.sessions)) return { goal: 10, ...s };
  } catch {}
  return { goal: 10, sessions: [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Не получилось сохранить');
  }
}

const running = () => state.sessions.at(-1)?.e === null;
const pad = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const nextDay = t => { const d = new Date(t); d.setHours(24, 0, 0, 0); return d.getTime(); };
const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const hm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hours = ms => { const h = ms / HOUR; return `${h >= 10 || Number.isInteger(+h.toFixed(1)) ? Math.round(h * 10) / 10 : h.toFixed(1)} ч`; };
const dur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60 ? `${m % 60} мин` : ''}`.trim(); };

// Time worked per day; days come from local midnights, so a night session splits in two.
function totals(now) {
  const map = new Map();
  for (const { s, e } of state.sessions) {
    const end = e ?? now;
    for (let a = s; a < end;) {
      const b = Math.min(end, nextDay(a));
      const k = dayKey(a);
      map.set(k, (map.get(k) || 0) + (b - a));
      a = b;
    }
  }
  return map;
}

function streak(map, now, goalMs) {
  let n = 0;
  let t = startOfDay(now);
  if ((map.get(dayKey(t)) || 0) < goalMs) t -= DAY / 2; // today still counts as not broken until it ends
  for (t = startOfDay(t); (map.get(dayKey(t)) || 0) >= goalMs; t = startOfDay(t - DAY / 2)) n++;
  return n;
}

function level(pct) {
  if (pct >= 1) return 'Monster mode';
  if (pct >= 0.75) return 'Locked in';
  if (pct >= 0.5) return 'Фокус';
  if (pct >= 0.25) return 'В потоке';
  if (pct > 0) return 'Разгон';
  return 'Время начинать';
}

function render() {
  const now = Date.now();
  const map = totals(now);
  const goalMs = state.goal * HOUR;
  const today = map.get(dayKey(now)) || 0;
  const pct = today / goalMs;
  const live = running();

  document.body.classList.toggle('running', live);
  document.body.classList.toggle('monster', pct >= 1);

  const d = new Date(now);
  $('today').textContent = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  $('clock').textContent = clock(today);
  $('status').textContent = live ? 'LOCKED IN' : 'OFFLINE';
  $('sub').textContent = pct >= 1
    ? `цель ${state.goal} ч взята · +${dur(today - goalMs)}`
    : `из ${state.goal} ч · осталось ${dur(goalMs - today)}`;
  $('ring').style.strokeDasharray = RING;
  $('ring').style.strokeDashoffset = RING * (1 - Math.min(pct, 1));
  $('level').textContent = `${level(pct)} · ${Math.round(pct * 100)}%`;

  const last = state.sessions.at(-1);
  $('btnIcon').innerHTML = live ? ICON_PAUSE : ICON_PLAY;
  $('btnLabel').textContent = live ? 'ПАУЗА' : today ? 'ПРОДОЛЖИТЬ' : 'НАЧАТЬ';
  $('btnHint').textContent = live ? `Сессия ${clock(now - last.s)}` : today ? 'Вернулся? Жми, и время продолжится' : 'Нажми, когда садишься работать';

  renderStats(map, now, goalMs);
  renderBars(map, now, goalMs);
  renderHeat(map, now, goalMs);
  renderSessions(now);
  $('streak').textContent = streak(map, now, goalMs);
}

function renderStats(map, now, goalMs) {
  let week = 0;
  for (let i = 0; i < 7; i++) week += map.get(dayKey(now - i * DAY)) || 0;
  // Average over the days since tracking began (up to 30), zeros included: honest about days off.
  const first = state.sessions[0]?.s ?? now;
  const span = Math.min(30, Math.floor((startOfDay(now) - startOfDay(first)) / DAY) + 1);
  let sum = 0;
  for (let i = 0; i < span; i++) sum += map.get(dayKey(now - i * DAY)) || 0;
  $('sWeek').textContent = hours(week);
  $('sAvg').textContent = hours(sum / span);
  $('sBest').textContent = hours(Math.max(0, ...map.values()));
  $('sHit').textContent = [...map.values()].filter(v => v >= goalMs).length;
}

function renderBars(map, now, goalMs) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const t = now - i * DAY;
    days.push({ t, v: map.get(dayKey(t)) || 0, today: i === 0 });
  }
  const top = Math.max(goalMs * 1.15, ...days.map(x => x.v));
  const goalY = (goalMs / top) * 100;
  // The goal line sits above the weekday labels (20px) at the goal's share of the 110px columns.
  $('bars').innerHTML = `<div class="goal-line" style="bottom:${20 + 1.1 * goalY}px"><span>${state.goal} ч</span></div>`
    + days.map(({ t, v, today }) => `<div class="bar${v >= goalMs ? ' on' : v ? ' part' : ''}${today ? ' today' : ''}">
        <em>${v ? (v / HOUR).toFixed(1) : ''}</em>
        <div class="col"><i style="height:${Math.max(3, (v / top) * 100)}%"></i></div>
        <small>${WEEKDAYS[new Date(t).getDay()]}</small>
      </div>`).join('');
  const hit = days.filter(x => x.v >= goalMs).length;
  $('weekNote').textContent = `цель взята ${hit} из 7`;
}

function renderHeat(map, now, goalMs) {
  const todayStart = startOfDay(now);
  const dow = (new Date(now).getDay() + 6) % 7; // Monday first
  const start = startOfDay(todayStart - (dow + 19 * 7) * DAY + DAY / 2);
  const cells = [];
  for (let i = 0; i < 20 * 7; i++) {
    const t = startOfDay(start + i * DAY + DAY / 2);
    if (t > todayStart) { cells.push('<i class="future"></i>'); continue; }
    const p = (map.get(dayKey(t)) || 0) / goalMs;
    const l = p >= 1 ? 4 : p >= 0.6 ? 3 : p >= 0.25 ? 2 : p > 0 ? 1 : 0;
    cells.push(`<i class="${l ? `l${l}` : ''}${t === todayStart ? ' today' : ''}" title="${dayKey(t)}"></i>`);
  }
  $('heat').innerHTML = cells.join('');
}

function renderSessions(now) {
  const from = startOfDay(now);
  const list = state.sessions
    .map((x, i) => ({ ...x, i }))
    .filter(x => (x.e ?? now) > from)
    .reverse();
  $('sessCount').textContent = list.length ? `${list.length}` : '';
  $('sessions').innerHTML = list.length
    ? list.map(x => `<li class="${x.e === null ? 'live' : ''}">
        <span class="bullet"></span>
        <span class="range">${hm(Math.max(x.s, from))} – ${x.e === null ? 'сейчас' : hm(x.e)}</span>
        <span class="dur">${dur((x.e ?? now) - Math.max(x.s, from))}</span>
        ${x.e === null ? '' : `<button class="del" data-i="${x.i}" aria-label="Удалить">${ICON_X}</button>`}
      </li>`).join('')
    : '<li class="empty">Пока пусто. Самое время начать.</li>';
}

function toggle() {
  const now = Date.now();
  if (running()) {
    const last = state.sessions.at(-1);
    last.e = now;
    // A mis-tap shorter than 10 seconds isn't a session.
    if (now - last.s < 10e3) state.sessions.pop();
    toast('Пауза. Отдохни и возвращайся');
  } else {
    state.sessions.push({ s: now, e: null });
    toast('Погнали. Ты в фокусе');
  }
  save();
  render();
}

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}

function setGoal(delta) {
  state.goal = Math.min(16, Math.max(1, state.goal + delta));
  $('goalVal').textContent = `${state.goal} ч`;
  save();
  render();
}

async function exportData() {
  const name = `locked-in-${dayKey(Date.now())}.json`;
  const file = new File([JSON.stringify(state)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Locked In' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions) || data.sessions.some(x => typeof x.s !== 'number')) throw new Error('bad');
    if (!confirm('Заменить текущие данные загруженной копией?')) return;
    state = { goal: Number(data.goal) || 10, sessions: data.sessions };
    save();
    render();
    toast('Копия загружена');
  } catch {
    toast('Это не файл Locked In');
  }
}

function wire() {
  $('toggle').addEventListener('click', toggle);
  $('sessions').addEventListener('click', e => {
    const b = e.target.closest('.del');
    if (!b || !confirm('Удалить эту сессию?')) return;
    state.sessions.splice(Number(b.dataset.i), 1);
    save();
    render();
  });
  $('settingsBtn').addEventListener('click', () => {
    $('goalVal').textContent = `${state.goal} ч`;
    $('sheet').classList.remove('hidden');
  });
  $('sheetClose').addEventListener('click', () => $('sheet').classList.add('hidden'));
  $('sheet').addEventListener('click', e => e.target === $('sheet') && $('sheet').classList.add('hidden'));
  document.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => setGoal(Number(b.dataset.goal))));
  $('exportBtn').addEventListener('click', exportData);
  $('importInput').addEventListener('change', e => e.target.files[0] && importData(e.target.files[0]));
  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Стереть всю историю? Это нельзя отменить.')) return;
    state = { goal: state.goal, sessions: [] };
    save();
    render();
  });
  document.addEventListener('visibilitychange', () => !document.hidden && render());

  // On an iPhone in Safari (not yet on the home screen), show how to install it.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('lockedin.installHint') === '1'; } catch {}
  if (ios && !standalone && !dismissed) $('install').classList.remove('hidden');
  $('installClose').addEventListener('click', () => {
    $('install').classList.add('hidden');
    try { localStorage.setItem('lockedin.installHint', '1'); } catch {}
  });
}

$('quote').textContent = QUOTES[Math.floor(Date.now() / DAY) % QUOTES.length];
wire();
render();
setInterval(() => !document.hidden && render(), 1000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
