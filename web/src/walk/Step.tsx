import { useState } from 'react';
import { Code } from './Code';
import { useWalk } from './ctx';
import { Json, valueText } from './Json';
import { Tag } from './Bars';
import { BoxIcon } from './icons';
import { Sec } from './parts';
import type { Held, Step, Value } from './types';

const ms = (n: number) => (n < 10 ? `${+n.toFixed(2)} ms` : `${Math.round(n)} ms`);

function ValueCard({ v, prev }: { v: Value; prev: unknown }) {
  const { walk, go } = useWalk();
  const [all, setAll] = useState(false);
  const text = valueText(v.value);
  const long = typeof v.value === 'string' && v.value.length > 700 && !all;
  const from = v.from;
  return (
    <div className="val">
      <div className="vh">
        <b>{v.name}</b>
        <span className="ty">
          {v.typeRef && walk.types[v.typeRef] ? (
            <a onClick={() => go.type(v.typeRef!)}>{v.type}</a>
          ) : (
            v.type
          )}
        </span>
        {from && (
          <span className="sp">
            <span className={`badge ${from.kind}`} title={from.ref}>
              {from.kind}
            </span>
          </span>
        )}
      </div>
      <pre>{long ? text.slice(0, 700) + '…' : <Json value={v.value} prev={prev} />}</pre>
      {long && (
        <a className="more" onClick={() => setAll(true)}>
          show all {text.length} characters
        </a>
      )}
      {(from || v.note) && (
        <div className="src" style={{ padding: '0 12px 9px' }}>
          {!from
            ? v.note
            : from.kind === 'captured'
              ? `from ${from.ref}${from.at ? ` · run captured ${from.at}` : ''}`
              : `built from the type: ${from.ref}`}
        </div>
      )}
    </div>
  );
}

export function StepCard({ trace, i }: { trace: Step[]; i: number }) {
  const { walk, wf, wi, go } = useWalk();
  const s = trace[i];
  const e = wf!.edges.find((x) => x.id === s.at);
  const whatif = wf!.whatifs?.find((x) => x.id === wi);
  const forks = !whatif ? (wf!.whatifs ?? []).filter((x) => x.fork === i) : [];
  const ends = e && (s.back ? [e.to, e.from] : [e.from, e.to]);
  const at = walk.nodes[s.at]
    ? walk.nodes[s.at].label
    : `${walk.nodes[ends![0]].label} → ${walk.nodes[ends![1]].label}`;
  const site =
    e?.at &&
    (() => {
      const h = e.at.hl[0][0];
      const a = Math.max(e.at.start, h - 2);
      return { ...e.at, start: a, lines: e.at.lines.slice(a - e.at.start, h - e.at.start + 3) };
    })();
  const prevValue = (v: Value) => {
    for (let k = i - 1; k >= 0; k--) {
      for (const p of trace[k].values) {
        if ((p.type && p.type === v.type) || (p.name && p.name === v.name)) return p.value;
      }
    }
    return undefined;
  };
  const vals = (vs: Value[]) => vs.map((v, k) => <ValueCard key={k} v={v} prev={prevValue(v)} />);
  const ins = s.values.filter((v) => v.dir === 'in');
  const outs = s.values.filter((v) => v.dir === 'out');
  const rest = s.values.filter((v) => !v.dir);
  return (
    <>
      <div className="card-h">
        <div className="gl" style={{ background: 'var(--data)', color: '#1b1608' }}>
          {i + 1}
        </div>
        <h2 style={{ fontFamily: 'var(--sans)' }}>{s.title}</h2>
        {s.tag && <Tag step={s} />}
      </div>
      <div className="loc">
        {whatif && (
          <>
            <span style={{ color: 'var(--data)' }}>what if {whatif.title}</span> ·{' '}
          </>
        )}
        step {i + 1} of {trace.length} · at {at}
        {s.ms !== undefined && ` · ${ms(s.ms)}`}
      </div>
      {s.jump && (
        <div className="step-note">
          <b>Jumps here</b> {s.jump}
        </div>
      )}
      {s.does && <p className="step-does">{s.does}</p>}
      {site && e && (
        <Sec
          h={
            <>
              Where ·{' '}
              <a onClick={() => go.edge(e.id)}>
                {site.path}:{site.hl[0][0]}
              </a>
            </>
          }
        >
          <Code code={site} />
        </Sec>
      )}
      {ins.length > 0 && <Sec h="In">{vals(ins)}</Sec>}
      {outs.length > 0 && <Sec h="Out">{vals(outs)}</Sec>}
      {rest.length > 0 && <Sec h="Values">{vals(rest)}</Sec>}
      {s.note && (
        <div className="step-note">
          <b>Notice</b> {s.note}
        </div>
      )}
      {(s.held || trace.some((x) => x.state)) && (
        <div className="held-inline">
          {s.held ? <HeldColumn step={s} /> : <StateColumn trace={trace} tr={i} />}
        </div>
      )}
      {forks.length > 0 && (
        <Sec h="What if…">
          {forks.map((x) => (
            <p key={x.id} style={{ marginBottom: 6 }}>
              <a onClick={() => go.whatif(x.id)}>What if {x.title}? →</a>{' '}
              <span style={{ color: 'var(--muted)' }}>{x.summary}</span>
            </p>
          ))}
        </Sec>
      )}
      {whatif && i === 0 && (
        <p className="src" style={{ marginTop: 8 }}>
          Branches off{' '}
          <a onClick={() => go.step(whatif.fork, null)}>
            step {whatif.fork + 1} of the main trace: {wf!.trace[whatif.fork].title}
          </a>
        </p>
      )}
      {walk.repo && (
        <p className="src" style={{ marginTop: 14 }}>
          Highlighted values changed since the last time this kind of value appeared.
        </p>
      )}
    </>
  );
}

const gname = (f: string) =>
  (f || '')
    .replace(/^[\w.-]+\//, '')
    .replace(/\(\*(\w+)\)\./, '$1.')
    .replace(/^[\w/]+\//, '');

export function StateColumn({ trace, tr }: { trace: Step[]; tr: number }) {
  const { walk } = useWalk();
  const st = trace[tr].state;
  let prev = null;
  for (let k = tr - 1; k >= 0 && !prev; k--) prev = trace[k].state ?? null;
  if (!st) {
    return (
      <div className="in">
        <div className="hd">State</div>
        <div className="sub">
          No stop here: this hop is not Go code in the running binary (the browser, the provider,
          the database). The next step that runs Go shows state again.
        </div>
      </div>
    );
  }
  const owners = [...new Set(st.items.map((x) => x.owner))];
  const was = new Set((prev?.goroutines ?? []).map((g) => g.id));
  const now = new Set(st.goroutines.map((g) => g.id));
  const ended = (prev?.goroutines ?? []).filter((g) => !now.has(g.id));
  const gr = (g: (typeof st.goroutines)[number], gone?: boolean) => (
    <div
      key={g.id + (gone ? 'x' : '')}
      className={`gr${g.id === st.goroutine ? ' on' : ''}${gone ? ' gone' : ''}`}
    >
      <span className="id">{g.id}</span>
      <span>
        {gname(g.fn)}
        {g.id === st.goroutine && (
          <>
            {' '}
            <span className="tag" style={{ color: 'var(--data)' }}>
              stopped here
            </span>
          </>
        )}
        {prev && !was.has(g.id) && (
          <>
            {' '}
            <span className="tag">new</span>
          </>
        )}
        {gone && (
          <>
            {' '}
            <span className="tag" style={{ color: 'var(--faint)' }}>
              ended
            </span>
          </>
        )}
        <span className="at">{gname(g.at)}</span>
        {walk.goroutineNotes[gname(g.fn)] && (
          <span className="at" style={{ color: 'var(--muted)' }}>
            {walk.goroutineNotes[gname(g.fn)]}
          </span>
        )}
      </span>
    </div>
  );
  return (
    <div className="in">
      <div className="hd">State</div>
      <div className="sub">
        Paused at{' '}
        <b>
          {trace[tr].stop?.path}:{trace[tr].stop?.line}
        </b>
        , before it runs · stop {st.stop} of {st.of} in the real run. Changed since the last stop is
        marked.
      </div>
      {owners.map((o) => (
        <div key={o}>
          <div className="own">{o || 'Values'}</div>
          {st.items
            .filter((x) => x.owner === o)
            .map((x) => {
              const p = prev?.items.find((y) => y.name === x.name)?.value;
              const chg = !!prev && JSON.stringify(p ?? null) !== JSON.stringify(x.value ?? null);
              const empty =
                x.value == null ||
                (Array.isArray(x.value) && !x.value.length) ||
                (typeof x.value === 'object' && !Object.keys(x.value as object).length);
              return (
                <div key={x.name} className={`it${chg ? ' chg' : ''}`}>
                  <div className="nm">{x.name}</div>
                  {x.note && <div className="note">{x.note}</div>}
                  <pre>
                    {empty ? (
                      <span className="none">{x.value == null ? 'not yet' : 'empty'}</span>
                    ) : (
                      <Json value={x.value} prev={p ?? undefined} />
                    )}
                  </pre>
                </div>
              );
            })}
        </div>
      ))}
      <div className="own">
        Goroutines · {st.goroutines.length} running{ended.length ? ` · ${ended.length} ended` : ''}
      </div>
      {st.goroutines.map((g) => gr(g))}
      {ended.map((g) => gr(g, true))}
    </div>
  );
}

// the state of a map step: what each node holds after it, with this step's changes marked
export function HeldColumn({ step }: { step: Step }) {
  const { walk } = useWalk();
  const held = step.held ?? [];
  const owners = [...new Set(held.map((x) => x.of ?? ''))];
  const item = (x: Held) => {
    const empty = x.value == null || (typeof x.value === 'object' && !Object.keys(x.value).length);
    return (
      <div key={x.name} className={`it${x.chg ? ' chg' : ''}${x.gone ? ' gone' : ''}`}>
        <div className="nm">
          {x.name}
          {x.gone && <span className="tag">removed</span>}
        </div>
        {x.note && <div className="note">{x.note}</div>}
        <pre>{empty ? <span className="none">empty</span> : <Json value={x.value} />}</pre>
      </div>
    );
  };
  return (
    <div className="in">
      <div className="hd">State</div>
      <div className="sub">
        After this step.{held.some((x) => x.chg) ? ' What it changed is marked.' : ''}
      </div>
      {step.total !== undefined && step.total > 0 && (
        <div className="clock">
          <span>
            <b>{ms(step.ms ?? 0)}</b> this step
          </span>
          <span>
            <b>{ms(step.total)}</b> so far
          </span>
        </div>
      )}
      {owners.map((o) => (
        <div key={o}>
          <div className="own">
            {walk.nodes[o] && (
              <BoxIcon kind={walk.nodes[o].kind} icon={walk.nodes[o].icon} size={18} />
            )}
            {walk.nodes[o]?.label ?? (o || 'Values')}
          </div>
          {held.filter((x) => (x.of ?? '') === o).map(item)}
        </div>
      ))}
      {!held.length && <div className="sub">Nothing held yet.</div>}
    </div>
  );
}
