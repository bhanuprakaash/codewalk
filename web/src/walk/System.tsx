import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, type CanvasHandle } from './Canvas';
import { ChangeSec, SeenButton, useChanges } from './changes';
import { FuncCard, MethodCard, TypeCard } from './cards';
import { WalkCtx, useWalk, type Goto } from './ctx';
import { KIND, layoutOf, neighbourhood } from './graph';
import { BoxIcon } from './icons';
import { initNav, reducer } from './nav';
import { NoteSec, OrphansCard, boxKey, orphans, type Notes } from './notes';
import { Panel } from './Panel';
import { PatternsCard } from './patterns';
import { Chip, Sec } from './parts';
import { patchUser } from './user';
import type { Pt, System as SystemData, User, Walk } from './types';

type Loaded = { sys: SystemData; user: User } | { error: string } | null;

export function System({
  project,
  id,
  onOpen,
}: {
  project: string;
  id?: string;
  onOpen(drill: string): void;
}) {
  const [data, setData] = useState<Loaded>(null);
  const query = `project=${encodeURIComponent(project)}`;

  useEffect(() => {
    let live = true;
    setData(null);
    (async () => {
      const res = await fetch(`/api/system?${query}${id ? `&id=${encodeURIComponent(id)}` : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { error: body?.error ?? res.statusText };
      }
      const sys = await res.json();
      const user = await fetch(`/api/user?${query}`).then(
        (r) => (r.ok ? r.json() : {}),
        () => ({}),
      );
      return { sys, user };
    })()
      .catch(() => ({ error: 'Could not reach the codewalk server. Is it running?' }))
      .then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [query, id]);

  if (!data) return <p className="note">Opening the system view…</p>;
  if ('error' in data) {
    return (
      <div className="notice">
        <h2>No system view yet</h2>
        <p>{data.error}</p>
      </div>
    );
  }
  return (
    <SystemView
      key={`${query}:${id}`}
      sys={data.sys}
      user={data.user}
      query={query}
      view={id ? `system:${id}` : 'system'}
      onOpen={onOpen}
    />
  );
}

function SystemView({
  sys,
  user,
  query,
  view,
  onOpen,
}: {
  sys: SystemData;
  user: User;
  query: string;
  view: string;
  onOpen(drill: string): void;
}) {
  const walk: Walk = useMemo(
    () => ({
      title: sys.title,
      scope: '',
      summary: sys.summary,
      repo: sys.repo,
      commit: sys.commit,
      dirty: false,
      capturedAt: '',
      goroutineNotes: {},
      packages: [],
      nodes: Object.fromEntries(
        Object.values(sys.boxes).map((b) => [b.id, { ...b, icon: b.icon || b.kind }]),
      ),
      types: sys.types,
      funcs: sys.funcs,
      patterns: sys.patterns,
      workflows: [],
    }),
    [sys],
  );
  const graph = useMemo(
    () => ({
      nodes: Object.keys(sys.boxes),
      edges: sys.edges.map((e) => ({ ...e, label: e.label || e.kind })),
      pos: Object.fromEntries(Object.values(sys.boxes).map((b) => [b.id, b.pos])),
    }),
    [sys],
  );
  const [s, dispatch] = useReducer(
    useMemo(() => reducer(walk), [walk]),
    view,
    initNav,
  );
  const canvas = useRef<CanvasHandle>(null);
  const userDoc = useRef(user);
  const [saveFailed, setSaveFailed] = useState(false);
  const changed = useChanges(
    view.startsWith('system:')
      ? `${query}&id=${encodeURIComponent(view.slice('system:'.length))}`
      : query,
  );
  const cur = s.hist[s.hi];
  const selected = s.open && cur ? cur : null;

  const [notes, setNotes] = useState<Notes>((user.notes as Notes) ?? {});
  const lost = orphans(walk, notes, true);
  const open = (k: 'node' | 'type' | 'method' | 'func' | 'orphans' | 'patterns', id: string) =>
    dispatch({ t: 'open', entry: { k, id } });
  const go: Goto = {
    node: (id) => {
      open('node', id);
      canvas.current?.fit([...neighbourhood(graph, id).ids]);
    },
    type: (id) => open('type', id),
    method: (typeSymbol, name) => open('method', `${typeSymbol}|${name}`),
    func: (id) => open('func', id),
    edge: (id) => dispatch({ t: 'open', entry: { k: 'edge', id, wf: view } }),
    step: () => {},
    whatif: () => {},
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('textarea, input')) return;
      if (e.altKey && e.key === 'ArrowLeft') dispatch({ t: 'go', d: -1 });
      else if (e.altKey && e.key === 'ArrowRight') dispatch({ t: 'go', d: 1 });
      else if (e.key === 'Escape') dispatch({ t: 'close' });
      else if (e.key === 'f') canvas.current?.fitAll();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const saved = userDoc.current.positions?.[view];
  const start: Record<string, Pt> = {
    ...graph.pos,
    ...(saved?.layout === layoutOf(graph) ? saved.nodes : {}),
  };
  const save = (doc: User, patch: object) => {
    userDoc.current = doc;
    return patchUser(query, patch).then((ok) => {
      setSaveFailed(!ok);
      return ok;
    });
  };
  const moved = (nodes: Record<string, Pt> | null) => {
    const positions = { ...userDoc.current.positions };
    const entry = nodes ? { layout: layoutOf(graph), nodes } : null;
    if (entry) positions[view] = entry;
    else delete positions[view];
    save({ ...userDoc.current, positions }, { positions: { [view]: entry } });
  };
  const setNote = (key: string, text: string | null) => {
    const next = { ...notes };
    if (text) next[key] = text;
    else delete next[key];
    setNotes(next);
    save({ ...userDoc.current, notes: next }, { notes: { [key]: text || null } });
  };
  const seen = (head: string) =>
    save({ ...userDoc.current, seenSha: head }, { seenSha: head }).then(
      (ok) => ok && changed.clear(),
    );

  let body;
  if (!cur) body = <p className="empty">Click a box, an edge or a type.</p>;
  else if (cur.k === 'node') body = <BoxCard id={cur.id} sys={sys} onOpen={onOpen} />;
  else if (cur.k === 'type') body = <TypeCard symbol={cur.id} />;
  else if (cur.k === 'method') body = <MethodCard id={cur.id} />;
  else if (cur.k === 'func') body = <FuncCard symbol={cur.id} />;
  else if (cur.k === 'patterns') body = <PatternsCard />;
  else if (cur.k === 'edge') body = <EdgeCard id={cur.id} sys={sys} />;
  else if (cur.k === 'orphans') body = <OrphansCard list={lost} />;

  return (
    <WalkCtx.Provider
      value={{ walk, wf: null, wi: null, go, changes: changed.res, notes, setNote }}
    >
      <div className="walk system">
        <header>
          <div className="brand">{sys.title}</div>
          <div className="sep" />
          <div className="right">
            <span className="meta">
              {sys.commit.slice(0, 7)}
              {saveFailed ? ' · could not save' : ''}
            </span>
            <button onClick={() => open('patterns', '')}>Go patterns</button>
            {lost.length > 0 && (
              <button onClick={() => open('orphans', '')}>Orphaned notes · {lost.length}</button>
            )}
            <SeenButton res={changed.res} onSeen={seen} />
          </div>
        </header>
        <div />
        <div id="body">
          <aside id="state" />
          <div id="canvasWrap">
            <Canvas
              ref={canvas}
              nodes={walk.nodes}
              wf={graph}
              start={start}
              step={null}
              stepKey=""
              selected={selected}
              onNode={(id) => (sys.boxes[id].drill ? onOpen(sys.boxes[id].drill!) : go.node(id))}
              onEdge={go.edge}
              onType={go.type}
              onMoved={moved}
              marks={changed.res?.changes}
            />
          </div>
          <Panel
            open={s.open}
            hi={s.hi}
            count={s.hist.length}
            bodyKey={JSON.stringify(cur)}
            tab="details"
            ask={false}
            onGo={(d) => dispatch({ t: 'go', d })}
            onTab={() => {}}
            onClose={() => dispatch({ t: 'close' })}
          >
            {body}
          </Panel>
        </div>
      </div>
    </WalkCtx.Provider>
  );
}

function BoxCard({
  id,
  sys,
  onOpen,
}: {
  id: string;
  sys: SystemData;
  onOpen(drill: string): void;
}) {
  const { walk, go, changes } = useWalk();
  const b = walk.nodes[id];
  const ins = sys.edges.filter((e) => e.to === id);
  const outs = sys.edges.filter((e) => e.from === id);
  const links = (h: string, es: SystemData['edges'], end: 'from' | 'to') =>
    es.length > 0 && (
      <Sec h={h}>
        <div className="rows">
          {es.map((e) => (
            <div className="row" key={e.id} onClick={() => go.node(e[end])}>
              <span className="l">{e.kind}</span>
              <span className="c">
                {walk.nodes[e[end]].label}
                {e.what && <span className="d"> · {e.what}</span>}
              </span>
            </div>
          ))}
        </div>
      </Sec>
    );
  return (
    <>
      <div className="card-h">
        <svg className="gl ib" viewBox="0 0 28 28" width={28} height={28}>
          <BoxIcon icon={b.icon!} kind={b.kind} x={5} y={5} size={18} />
        </svg>
        <h2>{b.label}</h2>
      </div>
      <div className="loc">
        {KIND[b.kind].name}
        {b.pkg ? ` · ${b.pkg}/` : ''}
      </div>
      {b.what && <p style={{ lineHeight: 1.6, margin: 0 }}>{b.what}</p>}
      {changes && <ChangeSec change={changes.changes[id]} base={changes.base} />}
      <NoteSec k={boxKey(id)} />
      {b.drill && (
        <p style={{ marginTop: 10 }}>
          <a onClick={() => onOpen(b.drill!)}>Open {b.drill} →</a>
        </p>
      )}
      {b.types && (
        <Sec h={`Types · ${b.types.length}`}>
          <div className="pills">
            {b.types.map((t) => (
              <Chip key={t} kind="type" glyph="T" onClick={() => go.type(t)}>
                {walk.types[t]?.name ?? t}
              </Chip>
            ))}
          </div>
        </Sec>
      )}
      {links('From', ins, 'from')}
      {links('To', outs, 'to')}
    </>
  );
}

function EdgeCard({ id, sys }: { id: string; sys: SystemData }) {
  const { walk } = useWalk();
  const e = sys.edges.find((x) => x.id === id);
  if (!e) return null;
  return (
    <>
      <div className="card-h">
        <div className="gl" style={{ background: 'var(--muted)' }}>
          →
        </div>
        <h2>
          {walk.nodes[e.from].label} → {walk.nodes[e.to].label}
        </h2>
      </div>
      <div className="loc">
        {e.kind}
        {e.label ? ` · ${e.label}` : ''}
      </div>
      {e.what && <p style={{ lineHeight: 1.6, margin: 0 }}>{e.what}</p>}
      {e.kind === 'imports' && (
        <p className="empty">Checked against the Go imports when the view was built.</p>
      )}
    </>
  );
}
