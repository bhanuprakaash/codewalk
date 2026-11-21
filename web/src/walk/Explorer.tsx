import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Ask, useAsk } from './Ask';
import { Legend, Summary, Tracebar } from './Bars';
import { Canvas, type CanvasHandle } from './Canvas';
import { SeenButton, useChanges } from './changes';
import { EdgeCard, FuncCard, MethodCard, NodeCard, TypeCard } from './cards';
import { WalkCtx, type Goto } from './ctx';
import { AskButton, PatternsButton, TopBar } from './Header';
import { layoutOf, neighbourhood } from './graph';
import { valueText } from './Json';
import { OVERVIEW, initNav, reducer, traceOf, workflowOf, type Entry } from './nav';
import { OrphansCard, orphans, type Notes } from './notes';
import { PatternsCard } from './patterns';
import { Overview } from './Overview';
import { Panel } from './Panel';
import { StateColumn, StepCard } from './Step';
import { patchUser } from './user';
import { useNav } from '../route';
import type { Pt, User, Walk, Workflow } from './types';

const startOf = (wf: Workflow, user: User): Record<string, Pt> => {
  const saved = user.positions?.[wf.id];
  return { ...wf.pos, ...(saved?.layout === layoutOf(wf) ? saved.nodes : {}) };
};

export function Explorer({
  walk,
  user,
  query,
  view,
  onView,
}: {
  walk: Walk;
  user: User;
  query: string;
  view: string;
  onView(v: string): void;
}) {
  const [s, dispatch] = useReducer(
    useMemo(() => reducer(walk), [walk]),
    view,
    (v) => initNav(workflowOf(walk, v) ? v : OVERVIEW),
  );
  const canvas = useRef<CanvasHandle>(null);
  const userDoc = useRef(user);
  const [saveFailed, setSaveFailed] = useState(false);
  const { route, go: navigate } = useNav();
  const asked = useAsk(query);
  const changed = useChanges(query);
  const [notes, setNotes] = useState<Notes>((user.notes as Notes) ?? {});
  const lost = orphans(walk, notes);

  const wf = workflowOf(walk, s.view);
  const ov = !wf;
  const trace = wf ? traceOf(wf, s.wi) : [];
  const whatif = wf?.whatifs?.find((x) => x.id === s.wi);
  const step = s.tr >= 0 ? (trace[s.tr] ?? null) : null;
  const tracing = !!step && trace.some((x) => x.state);
  const cur: Entry | undefined = s.hist[s.hi];
  const selected = s.open && cur ? cur : null;

  const show = (v: string) => {
    dispatch({ t: 'show', view: v });
    onView(v);
  };
  useEffect(() => {
    if (view !== s.view) dispatch({ t: 'show', view });
  }, [view]);

  const open = (entry: Entry) => dispatch({ t: 'open', entry });
  const go: Goto = {
    node: (id) => {
      open({ k: 'node', id });
      if (wf?.nodes.includes(id)) canvas.current?.fit([...neighbourhood(wf, id).ids]);
    },
    type: (id) => open({ k: 'type', id }),
    method: (typeSymbol, name) => {
      const symbol = walk.types[typeSymbol]?.methods.find((m) => m.name === name)?.symbol;
      const node = Object.values(walk.nodes).find((n) => n.symbol === symbol);
      open(node ? { k: 'node', id: node.id } : { k: 'method', id: `${typeSymbol}|${name}` });
    },
    func: (id) => open({ k: 'func', id }),
    edge: (id) => open({ k: 'edge', id, wf: s.view }),
    step: (i, wi) => dispatch({ t: 'trace', i, wi }),
    whatif: (id) => dispatch({ t: 'trace', i: 0, wi: id }),
    patterns: () => open({ k: 'patterns', id: '' }),
  };
  const stop = () => {
    if (!s.wi) canvas.current?.fitAll();
    dispatch({ t: 'stop' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('textarea, input')) return;
      if (e.key === '/') {
        e.preventDefault();
        dispatch({ t: 'tab', tab: 'ask' });
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        dispatch({ t: 'go', d: -1 });
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        dispatch({ t: 'go', d: 1 });
      } else if (e.key === 'Escape') {
        if (s.tr >= 0) stop();
        else dispatch({ t: 'close' });
      } else if (!ov && e.key === 'ArrowRight') dispatch({ t: 'trace', i: s.tr + 1 });
      else if (!ov && e.key === 'ArrowLeft' && (s.tr > 0 || s.wi))
        dispatch({ t: 'trace', i: s.tr - 1 });
      else if (!ov && e.key === 'f') canvas.current?.fitAll();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [s, ov]);

  const save = (doc: User, patch: object) => {
    userDoc.current = doc;
    return patchUser(query, patch).then((ok) => {
      setSaveFailed(!ok);
      return ok;
    });
  };
  const moved = (nodes: Record<string, Pt> | null) => {
    const positions = { ...userDoc.current.positions };
    const entry = nodes ? { layout: layoutOf(wf!), nodes } : null;
    if (entry) positions[wf!.id] = entry;
    else delete positions[wf!.id];
    save({ ...userDoc.current, positions }, { positions: { [wf!.id]: entry } });
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

  const onScreen = () => {
    const l = [`View: ${wf ? `workflow "${wf.title}"` : 'overview'}.`];
    if (step) {
      const values = step.values
        .map(
          (v) =>
            `${v.dir ? v.dir + ' ' : ''}${v.name} (${v.type}, ${v.from.kind}) = ${valueText(v.value).slice(0, 400)}`,
        )
        .join('; ');
      l.push(
        `${whatif ? `What-if "${whatif.title}" (a second captured run) ` : ''}Trace step ${s.tr + 1}/${trace.length}: ${step.title} (at ${step.at}).${step.does ? ` Does: ${step.does}` : ''} Values: ${values}`,
      );
    }
    if (selected?.k === 'node') {
      const n = walk.nodes[selected.id];
      l.push(
        `Selected: ${n.label}${n.path ? ` (${n.path}:${n.line})` : ''}${n.sig ? `, ${n.sig}` : ''}.`,
      );
    }
    if (selected?.k === 'type') {
      const t = walk.types[selected.id];
      l.push(`Selected type: ${t.name} (${t.path}:${t.line}).`);
    }
    if (selected?.k === 'edge') {
      const e = wf?.edges.find((x) => x.id === selected.id);
      if (e)
        l.push(
          `Selected edge: ${e.from} -> ${e.to}${e.at ? ` at ${e.at.path}:${e.at.hl[0][0]}` : ''}.`,
        );
    }
    return l;
  };

  const subject =
    cur?.k === 'node'
      ? walk.nodes[cur.id]?.label
      : cur?.k === 'type'
        ? walk.types[cur.id]?.name
        : undefined;

  let body;
  if (s.tab === 'ask')
    body = <Ask entries={asked.entries} query={query} onAsk={(q) => asked.ask(q, onScreen())} />;
  else if (!cur) body = <p className="empty">Click a node, an edge or a type, or start a trace.</p>;
  else if (cur.k === 'step') body = <StepCard trace={trace} i={cur.id} />;
  else if (cur.k === 'node') body = <NodeCard id={cur.id} />;
  else if (cur.k === 'type') body = <TypeCard symbol={cur.id} />;
  else if (cur.k === 'method') body = <MethodCard id={cur.id} />;
  else if (cur.k === 'func') body = <FuncCard symbol={cur.id} />;
  else if (cur.k === 'orphans') body = <OrphansCard list={lost} />;
  else if (cur.k === 'patterns') body = <PatternsCard />;
  else body = <EdgeCard id={cur.id} />;

  return (
    <WalkCtx.Provider value={{ walk, wf, wi: s.wi, go, changes: changed.res, notes, setNote }}>
      <div className={`walk${ov ? ' ov' : ''}${tracing ? ' tracing' : ''}`}>
        <TopBar
          tabs={[
            {
              label: 'System',
              tone: 'sys',
              on: false,
              open: () => navigate({ project: route.project }),
            },
            { label: 'Overview', tone: 'ov', on: ov, open: () => show(OVERVIEW) },
            ...walk.workflows.map((w) => ({
              label: w.title,
              tone: w.nodes.some((id) => walk.nodes[id].kind === 'you')
                ? ('you' as const)
                : ('go' as const),
              on: s.view === w.id,
              open: () => show(w.id),
            })),
          ]}
        >
          <span className="meta">
            <span className="sha">{walk.commit.slice(0, 7)}</span>
            {walk.dirty ? ' · dirty' : ''}
            {saveFailed ? ' · could not save' : ''}
            {changed.error ? ` · ${changed.error}` : ''}
          </span>
          {lost.length > 0 && (
            <button className="plain" onClick={() => open({ k: 'orphans', id: '' })}>
              Orphaned notes · {lost.length}
            </button>
          )}
          <SeenButton res={changed.res} onSeen={seen} />
          <PatternsButton
            n={walk.patterns?.length ?? 0}
            onOpen={() => open({ k: 'patterns', id: '' })}
          />
          <AskButton onAsk={() => dispatch({ t: 'tab', tab: 'ask' })} />
        </TopBar>
        <div id="body">
          <aside id="state">{tracing && <StateColumn trace={trace} tr={s.tr} />}</aside>
          <div id="canvasWrap">
            {wf ? (
              <>
                <Canvas
                  key={wf.id}
                  ref={canvas}
                  nodes={walk.nodes}
                  wf={wf}
                  start={startOf(wf, userDoc.current)}
                  step={step}
                  stepKey={`${s.wi}:${s.tr}`}
                  selected={selected}
                  onNode={(id) =>
                    dispatch({ t: 'open', entry: { k: 'node', id }, untrace: s.tr >= 0 })
                  }
                  onEdge={go.edge}
                  onMoved={moved}
                  marks={changed.res?.changes}
                />
                <Legend
                  kinds={wf.nodes.map((id) => walk.nodes[id].kind)}
                  edges={wf.edges.map((e) => e.kind)}
                />
                {!tracing && <Summary key={wf.id} wf={wf} />}
                <Tracebar
                  walk={walk}
                  wf={wf}
                  whatif={whatif}
                  trace={trace}
                  tr={s.tr}
                  onTrace={(i) => dispatch({ t: 'trace', i })}
                  onStop={stop}
                />
              </>
            ) : (
              <Overview walk={walk} onWorkflow={show} onNode={go.node} onType={go.type} />
            )}
          </div>
          <Panel
            open={s.open}
            hi={s.hi}
            count={s.hist.length}
            bodyKey={`${s.tab}:${JSON.stringify(cur)}`}
            tab={s.tab}
            subject={subject}
            onAsk={(q) => {
              dispatch({ t: 'tab', tab: 'ask' });
              asked.ask(q, onScreen());
            }}
            onGo={(d) => dispatch({ t: 'go', d })}
            onTab={(tab) => dispatch({ t: 'tab', tab })}
            onClose={() => dispatch({ t: 'close' })}
          >
            {body}
          </Panel>
        </div>
      </div>
    </WalkCtx.Provider>
  );
}
