// Data layer. Replace load/save with API calls later; the UI only uses these two.
export const PRIORITIES = ['low', 'med', 'high', 'urgent'];
export const PRI_LABEL = { low: 'Low', med: 'Medium', high: 'High', urgent: 'Urgent' };
export const STATUS_LABEL = { todo: 'To do', doing: 'In progress', done: 'Completed' };
export const REPEAT_LABEL = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
export const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#64748b'];
const KEY = 'taskspaces-v2';
const OLD = 'taskspaces-v1';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export function addDays(s, n) {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function nextDue(due, repeat) {
  const d = new Date((due || today()) + 'T00:00:00');
  if (repeat === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (repeat === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else {
    // monthly: clamp to last day of target month (avoids Jan 31 → Mar 3)
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return ymd(d);
}
export function dueText(due, time) {
  if (!due) return '';
  const t = today();
  const dueYear  = parseInt(due.slice(0, 4), 10);
  const thisYear = new Date().getFullYear();
  let s;
  if (due === t) {
    s = 'Today';
  } else if (due === addDays(t, 1)) {
    s = 'Tomorrow';
  } else if (dueYear !== thisYear) {
    s = new Date(due + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } else {
    s = new Date(due + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return time ? `${s}, ${time}` : s;
}

export function makeTask(p, settings) {
  const now = Date.now();
  return {
    id: uid(), title: '', notes: '', listId: null, due: '', time: '',
    priority: settings.defaultPriority, status: 'todo', tags: [], subtasks: [],
    repeat: 'none', createdAt: now, updatedAt: now, completedAt: null, ...p,
  };
}

const defaults = () => ({
  lists: [
    { id: 'business', name: 'Business', color: COLORS[0] },
    { id: 'growth', name: 'Growth', color: COLORS[2] },
    { id: 'life', name: 'Life', color: COLORS[3] },
  ],
  tasks: [],
  settings: { theme: 'light', defaultPriority: 'med', defaultList: '' },
});

function migrate(old) {
  const map = { agency: 'business', learning: 'growth', personal: 'life' };
  const d = defaults();
  d.tasks = old.filter((t) => t && t.title).map((t) =>
    makeTask({
      id: t.id || uid(), title: t.title, notes: t.notes || '', listId: map[t.space] || null,
      due: t.due || '', priority: t.priority === 'med' || t.priority === 'low' || t.priority === 'high' ? t.priority : 'med',
      status: t.done ? 'done' : 'todo', createdAt: t.createdAt || Date.now(),
      completedAt: t.done ? t.createdAt || Date.now() : null,
    }, d.settings));
  return d;
}

export function load() {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY));
    if (cur && Array.isArray(cur.lists) && Array.isArray(cur.tasks)) {
      return { ...defaults(), ...cur, settings: { ...defaults().settings, ...cur.settings } };
    }
    const old = JSON.parse(localStorage.getItem(OLD));
    if (Array.isArray(old)) return migrate(old);
  } catch { /* fall through to defaults */ }
  return defaults();
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}
