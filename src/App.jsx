import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRIORITIES, PRI_LABEL, STATUS_LABEL, REPEAT_LABEL, COLORS,
  uid, today, ymd, addDays, nextDue, dueText, makeTask, load, save,
} from './store.js';

const P = {
  inbox: 'M3 13l2-8h14l2 8M3 13v6h18v-6M3 13h5l1 2h6l1-2h5',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  all: 'M4 6h16M4 12h16M4 18h16',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.5-4.5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
};
const Icon = ({ n, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>
);

const NAV = [
  { id: 'inbox', name: 'Inbox', icon: 'inbox' },
  { id: 'today', name: 'Today', icon: 'sun' },
  { id: 'upcoming', name: 'Upcoming', icon: 'cal' },
  { id: 'all', name: 'All Tasks', icon: 'all' },
  { id: 'completed', name: 'Completed', icon: 'check' },
];
const RANK = { urgent: 0, high: 1, med: 2, low: 3 };
const EMPTY = {
  inbox: 'Inbox is clear. New tasks without a list land here.',
  today: 'Nothing due today. Add a task with a date to plan your day.',
  upcoming: 'No upcoming deadlines. Add a task with a future date.',
  all: 'No tasks yet. Type one above and press Enter.',
  completed: 'Completed tasks will show up here.',
};

function sorter(key) {
  return (a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    if (key === 'title') return a.title.localeCompare(b.title);
    if (key === 'created') return b.createdAt - a.createdAt;
    if (key === 'priority') return RANK[a.priority] - RANK[b.priority] || (a.due || '9').localeCompare(b.due || '9');
    return (a.due || '9').localeCompare(b.due || '9') || RANK[a.priority] - RANK[b.priority];
  };
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function QuickAdd({ view, data, onAdd, inputRef }) {
  const [title, setTitle] = useState('');
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [o, setO] = useState({ listId: '', due: '', priority: '' });
  const baseList = view.startsWith('list:') ? view.slice(5) : data.settings.defaultList;

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) { setErr('Enter a title to add a task.'); return; }
    onAdd({
      title: title.trim(),
      listId: (more && o.listId !== '' ? o.listId : baseList) || null,
      due: (more && o.due) || (view === 'today' ? today() : ''),
      priority: (more && o.priority) || data.settings.defaultPriority,
    });
    setTitle(''); setErr(''); setO({ listId: '', due: '', priority: '' });
  }
  return (
    <form className="quick" onSubmit={submit}>
      <div className="quick-line">
        <Icon n="plus" />
        <input ref={inputRef} value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }}
          placeholder="Add a task  (press N)" aria-label="New task title" aria-invalid={!!err} />
        <button type="button" className="ghost" onClick={() => setMore(!more)} aria-expanded={more}>Details</button>
        <button type="submit" className="primary">Add</button>
      </div>
      {more && (
        <div className="quick-more">
          <select value={o.listId} onChange={(e) => setO({ ...o, listId: e.target.value })} aria-label="List">
            <option value="">Default list</option>
            {data.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="date" value={o.due} onChange={(e) => setO({ ...o, due: e.target.value })} aria-label="Due date" />
          <select value={o.priority} onChange={(e) => setO({ ...o, priority: e.target.value })} aria-label="Priority">
            <option value="">Default priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
          </select>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </form>
  );
}

function Row({ t, data, onOpen, onToggle, onDup, onDel, selected }) {
  const list = data.lists.find((l) => l.id === t.listId);
  const done = t.status === 'done';
  const late = !done && t.due && t.due < today();
  const subDone = t.subtasks.filter((s) => s.done).length;
  return (
    <li className={`row ${done ? 'done' : ''} ${selected ? 'sel' : ''}`}>
      <button className={`check ${done ? 'on' : ''}`} onClick={() => onToggle(t.id)}
        aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}>{done && <Icon n="check" s={12} />}</button>
      <button className="row-main" onClick={() => onOpen(t.id)}>
        <span className="row-title">{t.title}</span>
        <span className="row-meta">
          {t.status === 'doing' && <em className="tag-doing">In progress</em>}
          {t.due && <em className={late ? 'late' : ''}>{late ? 'Overdue, ' : ''}{dueText(t.due, t.time)}</em>}
          {t.repeat !== 'none' && <em>{REPEAT_LABEL[t.repeat]}</em>}
          {t.subtasks.length > 0 && <em>{subDone}/{t.subtasks.length} subtasks</em>}
          {t.tags.map((g) => <em key={g} className="tag">#{g}</em>)}
        </span>
      </button>
      <span className={`pri p-${t.priority}`} title={`${PRI_LABEL[t.priority]} priority`}>{PRI_LABEL[t.priority]}</span>
      <span className="chip" style={{ '--c': list ? list.color : 'var(--muted)' }}>{list ? list.name : 'Inbox'}</span>
      <span className="row-actions">
        <button onClick={() => onDup(t.id)} aria-label="Duplicate task"><Icon n="copy" /></button>
        <button onClick={() => onDel(t.id)} aria-label="Delete task"><Icon n="trash" /></button>
      </span>
    </li>
  );
}

function Panel({ t, data, onPatch, onClose, onDup, onDel }) {
  const [title, setTitle] = useState(t.title);
  const [tags, setTags] = useState(t.tags.join(', '));
  const [sub, setSub] = useState('');
  const setSubs = (subtasks) => onPatch(t.id, { subtasks });
  return (
    <aside className="panel" role="dialog" aria-label="Task details">
      <div className="panel-head">
        <span>Task details</span>
        <button className="icon" onClick={onClose} aria-label="Close details"><Icon n="x" /></button>
      </div>
      <Field label="Title">
        <input value={title} aria-invalid={!title.trim()} onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) onPatch(t.id, { title: e.target.value.trim() });
        }} />
        {!title.trim() && <small className="err">Title can't be empty. The last valid title is kept.</small>}
      </Field>
      <Field label="Description">
        <textarea rows={3} value={t.notes} onChange={(e) => onPatch(t.id, { notes: e.target.value })} />
      </Field>
      <div className="grid2">
        <Field label="List">
          <select value={t.listId || ''} onChange={(e) => onPatch(t.id, { listId: e.target.value || null })}>
            <option value="">Inbox</option>
            {data.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={t.status} onChange={(e) => onPatch(t.id, { status: e.target.value, completedAt: e.target.value === 'done' ? Date.now() : null })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Due date"><input type="date" value={t.due} onChange={(e) => onPatch(t.id, { due: e.target.value, time: e.target.value ? t.time : '' })} /></Field>
        <Field label="Due time"><input type="time" value={t.time} disabled={!t.due} onChange={(e) => onPatch(t.id, { time: e.target.value })} /></Field>
        <Field label="Priority">
          <select value={t.priority} onChange={(e) => onPatch(t.id, { priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Repeat">
          <select value={t.repeat} onChange={(e) => onPatch(t.id, { repeat: e.target.value })}>
            {Object.entries(REPEAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Tags (comma separated)">
        <input value={tags} onChange={(e) => setTags(e.target.value)}
          onBlur={() => onPatch(t.id, { tags: [...new Set(tags.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean))] })} />
      </Field>
      <div className="field">
        <span>Subtasks</span>
        <ul className="subs">
          {t.subtasks.map((s) => (
            <li key={s.id}>
              <input type="checkbox" checked={s.done} onChange={() => setSubs(t.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} aria-label={s.text} />
              <span className={s.done ? 'struck' : ''}>{s.text}</span>
              <button className="icon" onClick={() => setSubs(t.subtasks.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.text}`}><Icon n="x" s={14} /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); if (sub.trim()) { setSubs([...t.subtasks, { id: uid(), text: sub.trim(), done: false }]); setSub(''); } }}>
          <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a subtask and press Enter" />
        </form>
      </div>
      <p className="stamp">Created {new Date(t.createdAt).toLocaleString()}<br />Updated {new Date(t.updatedAt).toLocaleString()}</p>
      <div className="panel-foot">
        <button className="ghost" onClick={() => onDup(t.id)}>Duplicate</button>
        <button className="danger" onClick={() => onDel(t.id)}>Delete task</button>
      </div>
    </aside>
  );
}

function Dashboard({ tasks }) {
  // ── Live clock: updates every second ────────────────────────
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);   // cleanup on unmount
  }, []);

  const t = today();
  const open = tasks.filter((x) => x.status !== 'done');
  const overdue = open.filter((x) => x.due && x.due < t).length;
  const doneToday = tasks.filter((x) => x.status === 'done' && x.completedAt && ymd(new Date(x.completedAt)) === t).length;
  const dueNow = open.filter((x) => x.due && x.due <= t).length;
  const pct = doneToday + dueNow ? Math.round((doneToday / (doneToday + dueNow)) * 100) : 0;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(t, i - 6);
    return { d, n: tasks.filter((x) => x.completedAt && ymd(new Date(x.completedAt)) === d).length };
  });
  const max = Math.max(1, ...days.map((x) => x.n));
  const week = days.reduce((a, x) => a + x.n, 0);
  const soon = open.filter((x) => x.due > t).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);

  const h = now.getHours();
  const hi = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

  // Format: "Saturday, October 17, 2026"
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Format: "11:33:04 PM"
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <section className="dash">
      <div className="dash-greeting">
        <div>
          <h2>{hi}</h2>
          <p className="muted">{dateStr}</p>
        </div>
        <div className="live-clock" aria-live="off" aria-label={`Current time: ${timeStr}`}>
          {timeStr}
        </div>
      </div>
      <div className="stats">
        <div><b>{open.length}</b><span>Open</span></div>
        <div><b>{tasks.length - open.length}</b><span>Completed</span></div>
        <div className={overdue ? 'warn' : ''}><b>{overdue}</b><span>Overdue</span></div>
      </div>
      <div className="progress" aria-label="Today's progress">
        <div className="bar"><i style={{ width: pct + '%' }} /></div>
        <span>{dueNow + doneToday ? `${doneToday} of ${doneToday + dueNow} planned tasks done (${pct}%)` : 'No tasks planned for today'}</span>
      </div>
      <div className="dash-cols">
        <div>
          <h4>Next deadlines</h4>
          {soon.length ? soon.map((x) => <p key={x.id} className="mini"><span>{x.title}</span><em>{dueText(x.due, x.time)}</em></p>) : <p className="muted">None scheduled.</p>}
        </div>
        <div>
          <h4>Last 7 days: {week} completed</h4>
          <div className="week">{days.map((x) => <i key={x.d} title={`${x.d}: ${x.n}`} style={{ height: 6 + (x.n / max) * 34 }} />)}</div>
        </div>
      </div>
    </section>
  );
}


function ListDialog({ list, lists, onSave, onDelete, onMove, onClose }) {
  const [name, setName] = useState(list.name || '');
  const [color, setColor] = useState(list.color || COLORS[0]);
  const [err, setErr] = useState('');
  const exists = !!list.id;
  function submit(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setErr('Enter a list name.');
    if (lists.some((l) => l.id !== list.id && l.name.toLowerCase() === n.toLowerCase())) return setErr('A list with this name already exists.');
    onSave({ id: list.id || uid(), name: n, color });
  }
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="modal" role="dialog" aria-label={exists ? 'Edit list' : 'New list'} onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{exists ? 'Edit list' : 'New list'}</h3>
        <Field label="Name"><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="swatches" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={c === color} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}
        </div>
        <div className="modal-foot">
          {exists && <button type="button" className="danger" onClick={() => onDelete(list)}>Delete</button>}
          {exists && <button type="button" className="ghost" onClick={() => onMove(list.id, -1)}>Move up</button>}
          {exists && <button type="button" className="ghost" onClick={() => onMove(list.id, 1)}>Move down</button>}
          <span className="grow" />
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(load);
  const ref = useRef(data);
  const [view, setView] = useState('today');
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('due');
  const [pf, setPf] = useState('');
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const addRef = useRef(null);
  const searchRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => { save(data); }, [data]);
  useEffect(() => { document.documentElement.dataset.theme = data.settings.theme; }, [data.settings.theme]);

  function commit(fn, msg) {
    const prev = ref.current;
    const next = fn(prev);
    ref.current = next;
    setData(next);
    clearTimeout(timer.current);
    if (msg) {
      setToast({ msg, undo: () => { ref.current = prev; setData(prev); setToast(null); } });
      timer.current = setTimeout(() => setToast(null), 5000);
    }
  }
  const setTasks = (d, tasks) => ({ ...d, tasks });
  const addTask = useCallback((p) => commit((d) => setTasks(d, [makeTask(p, d.settings), ...d.tasks]), 'Task added'), []);
  const patch = useCallback((id, p) => commit((d) => setTasks(d, d.tasks.map((x) => (x.id === id ? { ...x, ...p, updatedAt: Date.now() } : x)))), []);
  const toggle = useCallback((id) => {
    commit((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (!t) return d;
      if (t.status === 'done') return setTasks(d, d.tasks.map((x) => (x.id === id ? { ...x, status: 'todo', completedAt: null, updatedAt: Date.now() } : x)));
      let tasks = d.tasks.map((x) => (x.id === id ? { ...x, status: 'done', completedAt: Date.now(), updatedAt: Date.now() } : x));
      if (t.repeat !== 'none') {
        tasks = [makeTask({ ...t, id: uid(), status: 'todo', due: nextDue(t.due, t.repeat), completedAt: null, createdAt: Date.now(), subtasks: t.subtasks.map((s) => ({ ...s, done: false })) }, d.settings), ...tasks];
      }
      return setTasks(d, tasks);
    }, ref.current.tasks.find((x) => x.id === id)?.status === 'done' ? 'Task reopened' : 'Task completed');
  }, []);
  const dup = useCallback((id) => commit((d) => {
    const t = d.tasks.find((x) => x.id === id);
    return t ? setTasks(d, [makeTask({ ...t, id: uid(), title: t.title + ' (copy)', status: 'todo', completedAt: null, createdAt: Date.now(), subtasks: t.subtasks.map((s) => ({ ...s, id: uid() })) }, d.settings), ...d.tasks]) : d;
  }, 'Task duplicated'), []);
  const del = useCallback((id) => { setSel((s) => (s === id ? null : s)); commit((d) => setTasks(d, d.tasks.filter((x) => x.id !== id)), 'Task deleted'); }, []);
  const saveList = useCallback((l) => {
    commit((d) => ({ ...d, lists: d.lists.some((x) => x.id === l.id) ? d.lists.map((x) => (x.id === l.id ? l : x)) : [...d.lists, l] }), 'List saved');
    setDlg(null);
  }, []);
  function askDeleteList(l) {
    const n = ref.current.tasks.filter((t) => t.listId === l.id).length;
    setConfirm({
      text: `Delete the list "${l.name}"? ${n ? `Its ${n} task${n > 1 ? 's' : ''} will move to Inbox.` : 'It has no tasks.'}`,
      label: 'Delete list',
      run: () => {
        commit((d) => ({
          ...d,
          lists: d.lists.filter((x) => x.id !== l.id),
          tasks: d.tasks.map((t) => (t.listId === l.id ? { ...t, listId: null } : t)),
          settings: { ...d.settings, defaultList: d.settings.defaultList === l.id ? '' : d.settings.defaultList },
        }), 'List deleted');
        if (view === 'list:' + l.id) setView('inbox');
        setDlg(null);
      },
    });
  }
  const moveList = useCallback((id, dir) => commit((d) => {
    const i = d.lists.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.lists.length) return d;
    const lists = [...d.lists];
    [lists[i], lists[j]] = [lists[j], lists[i]];
    return { ...d, lists };
  }), []);
  const askDeleteTask = useCallback((id) => {
    const t = ref.current.tasks.find((x) => x.id === id);
    setConfirm({ text: `Delete "${t ? t.title : 'this task'}"? You can undo right after.`, label: 'Delete task', run: () => del(id) });
  }, [del]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'Escape') { setSel(null); setConfirm(null); setDlg(null); setShowSettings(false); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n') { e.preventDefault(); addRef.current?.focus(); }
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (/^[1-5]$/.test(e.key)) setView(NAV[+e.key - 1].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const t0 = today();
  const { tasks, lists, settings } = data;
  const isOpen = (x) => x.status !== 'done';
  const counts = {
    inbox: tasks.filter((x) => !x.listId && isOpen(x)).length,
    today: tasks.filter((x) => isOpen(x) && x.due && x.due <= t0).length,
    upcoming: tasks.filter((x) => isOpen(x) && x.due > t0).length,
    all: tasks.filter(isOpen).length,
    completed: tasks.filter((x) => !isOpen(x)).length,
  };
  // memoized per-list open counts — avoids duplicate filter calls in the sidebar
  const listCounts = useMemo(
    () => Object.fromEntries(lists.map((l) => [l.id, tasks.filter((x) => x.listId === l.id && isOpen(x)).length])),
    [tasks, lists]
  );
  useEffect(() => { document.title = counts.today ? `(${counts.today}) Tasks` : 'Tasks'; }, [counts.today]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((x) => {
      if (view === 'inbox' ? !(!x.listId && isOpen(x))
        : view === 'today' ? !(isOpen(x) && x.due && x.due <= t0)
        : view === 'upcoming' ? !(isOpen(x) && x.due > t0)
        : view === 'completed' ? isOpen(x)
        : view.startsWith('list:') ? x.listId !== view.slice(5) : false) return false;
      if (pf && x.priority !== pf) return false;
      return !needle || [x.title, x.notes, ...x.tags].join(' ').toLowerCase().includes(needle);
    }).sort(sorter(sortKey));
  }, [tasks, view, q, pf, sortKey, t0]);

  const activeList = view.startsWith('list:') ? lists.find((l) => l.id === view.slice(5)) : null;
  const title = activeList ? activeList.name : NAV.find((n) => n.id === view)?.name;
  const selected = tasks.find((x) => x.id === sel);
  const rowProps = { data, onOpen: setSel, onToggle: toggle, onDup: dup, onDel: askDeleteTask };
  const overdue = view === 'today' ? visible.filter((x) => x.due < t0) : [];
  const rest = view === 'today' ? visible.filter((x) => x.due >= t0) : visible;

  return (
    <div className="app">
      <aside className="side">
        <h1 className="brand">Taskspaces</h1>
        <nav aria-label="Views">
          {NAV.map((n, i) => (
            <button key={n.id} className={`nav ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)} title={`Shortcut ${i + 1}`}>
              <Icon n={n.icon} /><span>{n.name}</span>{counts[n.id] > 0 && <b className={n.id === 'today' ? 'hot' : ''}>{counts[n.id]}</b>}
            </button>
          ))}
        </nav>
        <div className="side-sec"><span>Lists</span><button className="icon" onClick={() => setDlg({})} aria-label="New list"><Icon n="plus" /></button></div>
        <nav aria-label="Lists">
          {lists.map((l) => (
            <div key={l.id} className={`nav ${view === 'list:' + l.id ? 'active' : ''}`}>
              <button className="nav-in" onClick={() => setView('list:' + l.id)}>
                <i className="swatch" style={{ background: l.color }} /><span>{l.name}</span>
                {listCounts[l.id] > 0 && <b>{listCounts[l.id]}</b>}
              </button>
              <button className="icon edit" onClick={() => setDlg(l)} aria-label={`Edit ${l.name}`}><Icon n="edit" s={14} /></button>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className="icon" onClick={() => setShowSettings(true)} aria-label="Settings"><Icon n="sliders" /></button>
          <button className="icon" onClick={() => commit((d) => ({ ...d, settings: { ...d.settings, theme: d.settings.theme === 'dark' ? 'light' : 'dark' } }))} aria-label="Toggle theme"><Icon n={settings.theme === 'dark' ? 'sun' : 'moon'} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <h2>{title}</h2>
          <div className="tools">
            <label className="search"><Icon n="search" /><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  (/ or Ctrl+K)" aria-label="Search tasks" /></label>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort by">
              <option value="due">Sort: Due date</option><option value="priority">Sort: Priority</option>
              <option value="created">Sort: Created</option><option value="title">Sort: Title</option>
            </select>
            <select value={pf} onChange={(e) => setPf(e.target.value)} aria-label="Filter by priority">
              <option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
            </select>
          </div>
        </header>
        {view === 'today' && <Dashboard tasks={tasks} />}
        <QuickAdd key={view} view={view} data={data} onAdd={addTask} inputRef={addRef} />
        {overdue.length > 0 && <><h4 className="sec late">Overdue</h4><ul className="rows">{overdue.map((t) => <Row key={t.id} t={t} selected={sel === t.id} {...rowProps} />)}</ul></>}
        {rest.length > 0 && <>{view === 'today' && <h4 className="sec">Due today</h4>}<ul className="rows">{rest.map((t) => <Row key={t.id} t={t} selected={sel === t.id} {...rowProps} />)}</ul></>}
        {!visible.length && <p className="empty">{q || pf ? 'No tasks match your search or filter.' : activeList ? `No tasks in ${activeList.name}. Add one above.` : EMPTY[view]}</p>}
      </main>

      {selected && <Panel key={selected.id} t={selected} data={data} onPatch={patch} onClose={() => setSel(null)} onDup={dup} onDel={askDeleteTask} />}
      {toast && <div className="toast" role="status"><span>{toast.msg}</span><button onClick={toast.undo}>Undo</button></div>}
      {dlg && <ListDialog key={dlg.id || 'new'} list={dlg} lists={lists} onSave={saveList} onDelete={askDeleteList} onMove={moveList} onClose={() => setDlg(null)} />}
      {showSettings && (
        <div className="overlay" onMouseDown={() => setShowSettings(false)}>
          <div className="modal" role="dialog" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <Field label="Default priority"><select value={settings.defaultPriority} onChange={(e) => commit((d) => ({ ...d, settings: { ...d.settings, defaultPriority: e.target.value } }))}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}</select></Field>
            <Field label="Default list"><select value={settings.defaultList} onChange={(e) => commit((d) => ({ ...d, settings: { ...d.settings, defaultList: e.target.value } }))}><option value="">Inbox</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <p className="muted">Shortcuts: N new task, / or Ctrl+K search, 1 to 5 switch views, Esc close.</p>
            <div className="modal-foot"><span className="grow" /><button className="primary" onClick={() => setShowSettings(false)}>Done</button></div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="overlay" onMouseDown={() => setConfirm(null)}>
          <div className="modal" role="alertdialog" aria-label="Confirm" onMouseDown={(e) => e.stopPropagation()}>
            <p>{confirm.text}</p>
            <div className="modal-foot"><span className="grow" /><button className="ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="danger solid" autoFocus onClick={() => { const c = confirm; setConfirm(null); c.run(); }}>{confirm.label}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
