import { useState } from 'react';
import { Code } from './Code';
import { useWalk } from './ctx';
import { KIND, kc } from './graph';
import { Chip, LinkTypes, Rows, Sec, TypeLink, WhyBox } from './parts';
import type { Edge, EdgeKind, Method, WalkType } from './types';

const isPublic = (name: string) => /^[A-Z]/.test(name);

export function NodeCard({ id }: { id: string }) {
  const { walk, wf, go } = useWalk();
  const [line, setLine] = useState<number | null>(null);
  const n = walk.nodes[id];
  const recv = n.recv ? walk.types[n.recv] : null;
  const t = n.type ? walk.types[n.type] : null;

  // by what the edge is: a value arriving from another goroutine is not a caller
  const IN: Record<EdgeKind, string> = {
    call: 'Called by',
    when: 'Called by',
    go: 'Gets values from (another goroutine)',
    stores: 'Stored by',
    asks: 'Asked by',
  };
  const OUT: Record<EdgeKind, string> = {
    call: 'Calls',
    when: 'Calls',
    go: 'Starts or feeds (another goroutine)',
    stores: 'Stores to',
    asks: 'Asks',
  };
  const ws = wf ? [wf] : walk.workflows.filter((w) => w.nodes.includes(id));
  const ins = ws.flatMap((w) => w.edges.filter((e) => e.to === id));
  const outs = ws.flatMap((w) => w.edges.filter((e) => e.from === id));
  const group = (es: Edge[], names: Record<EdgeKind, string>, end: 'from' | 'to') =>
    [...new Set(es.map((e) => names[e.kind]))].map((h) => (
      <Sec key={h} h={h}>
        <div className="pills">
          {[...new Map(es.filter((e) => names[e.kind] === h).map((e) => [e[end], e])).values()].map(
            (e) => (
              <Chip
                key={e[end]}
                kind={walk.nodes[e[end]].kind}
                glyph={KIND[walk.nodes[e[end]].kind].g}
                onClick={() => go.node(e[end])}
              >
                {walk.nodes[e[end]].label}
                {e.cond && (
                  <>
                    {' '}
                    <em style={{ color: 'var(--muted)', fontStyle: 'normal' }}>when {e.cond}</em>
                  </>
                )}
              </Chip>
            ),
          )}
        </div>
      </Sec>
    ));

  return (
    <>
      <div className="card-h">
        <div className="gl" style={{ background: kc(n.kind) }}>
          {KIND[n.kind].g}
        </div>
        <h2>{n.label}</h2>
      </div>
      <div className="loc">
        {n.path ? `${n.path}:${n.line}` : KIND[n.kind].name}
        {n.pkg ? ` · ${n.pkg}/` : ''}
      </div>
      {n.what && <p style={{ lineHeight: 1.6, margin: 0 }}>{n.what}</p>}
      {n.why && (
        <Sec h="Why it exists">
          <WhyBox why={n.why} />
        </Sec>
      )}
      {n.sig && (
        <Sec h="In → out">
          <div className="sig">
            {recv && (
              <span style={{ color: 'var(--muted)' }}>
                (<TypeLink symbol={n.recv} />){' '}
              </span>
            )}
            <LinkTypes text={n.sig} />
          </div>
        </Sec>
      )}
      {recv && (
        <Sec h={`Receiver · ${recv.name}`}>
          <p>{recv.role || recv.doc}</p>
          <p style={{ marginTop: 6 }}>
            <a onClick={() => go.type(n.recv!)}>Fields of {recv.name} →</a>
          </p>
        </Sec>
      )}
      {t && (
        <Sec h="Type">
          <p>{t.role || t.doc}</p>
          <p style={{ marginTop: 6 }}>
            <a onClick={() => go.type(n.type!)}>Open {t.name} →</a>
          </p>
        </Sec>
      )}
      <Rows errs={n.errs} gos={n.gos} locks={n.locks} selects={n.selects} onLine={setLine} />
      {n.gotcha && (
        <Sec h="Watch out">
          <div className="gotcha">{n.gotcha}</div>
        </Sec>
      )}
      {group(ins, IN, 'from')}
      {group(outs, OUT, 'to')}
      {n.code && (
        <Sec h="Code">
          <Code
            code={n.code}
            hl={line === null ? (n.code.hl ?? [[n.line!, n.line!]]) : [[line, line]]}
            reveal={line !== null}
          />
        </Sec>
      )}
    </>
  );
}

// a type's methods: exported (what other packages call) and internal, collapsed, filterable, each opens its card
function Methods({ t }: { t: WalkType }) {
  const { go } = useWalk();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const group = (title: string, ms: Method[], hint: string) => {
    const shown = ms.filter((m) => !query || m.name.toLowerCase().includes(query));
    if (!ms.length || (query && !shown.length)) return null;
    return (
      <details className="mgroup" open={!!query && shown.length > 0}>
        <summary>
          {title} · {ms.length} <span>{hint}</span>
        </summary>
        <div className="pills">
          {shown.map((m) => (
            <Chip
              key={m.name}
              kind="func"
              glyph="ƒ"
              title={m.sig}
              onClick={() => go.method(t.symbol, m.name)}
            >
              {m.name}
            </Chip>
          ))}
        </div>
      </details>
    );
  };
  return (
    <Sec h={`Methods · ${t.methods.length}`}>
      <input
        className="mfilter"
        placeholder="Filter methods…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {group(
        'Public API',
        t.methods.filter((m) => isPublic(m.name)),
        'exported: what other packages call',
      )}
      {group(
        'Internal',
        t.methods.filter((m) => !isPublic(m.name)),
        'only this package calls them',
      )}
    </Sec>
  );
}

export function TypeCard({ symbol }: { symbol: string }) {
  const { walk, go } = useWalk();
  const t = walk.types[symbol];
  if (!t) return null;
  const users = Object.values(walk.nodes).filter((n) => n.recv === symbol);
  return (
    <>
      <div className="card-h">
        <div className="gl" style={{ background: 'var(--k-type)' }}>
          T
        </div>
        <h2>{t.name}</h2>
      </div>
      <div className="loc">
        {t.path}:{t.line} · {t.kind}
      </div>
      {t.role && <p style={{ lineHeight: 1.6, margin: 0 }}>{t.role}</p>}
      {t.doc && t.doc !== t.role && (
        <Sec h="Doc comment">
          <p style={{ color: 'var(--muted)' }}>{t.doc}</p>
        </Sec>
      )}
      {t.implementedBy.length > 0 && (
        <Sec h="Implemented by">
          <div className="pills">
            {t.implementedBy.map((x) => (
              <Chip key={x} kind="type" glyph="T">
                {x}
              </Chip>
            ))}
          </div>
        </Sec>
      )}
      {t.fields.length > 0 && (
        <Sec h={`${t.kind === 'interface' ? 'Methods' : 'Fields'} · ${t.fields.length}`}>
          <div className="rows fields">
            {t.fields.map((f) => (
              <div className="row" key={f.name}>
                <span className="c">{f.name}</span>
                <span className="c" style={{ color: 'var(--muted)' }}>
                  <LinkTypes text={f.type} />
                </span>
                {f.doc && <span className="d">{f.doc}</span>}
              </div>
            ))}
          </div>
        </Sec>
      )}
      {users.length > 0 && (
        <Sec h="On this walk's map">
          <div className="pills">
            {users.map((n) => (
              <Chip key={n.id} kind={n.kind} glyph="ƒ" onClick={() => go.node(n.id)}>
                {n.label}
              </Chip>
            ))}
          </div>
        </Sec>
      )}
      {t.methods.length > 0 && <Methods t={t} />}
      <Sec h="Code">
        <Code code={t.code} hl={[[t.line, t.line]]} />
      </Sec>
    </>
  );
}

export function MethodCard({ id }: { id: string }) {
  const { walk } = useWalk();
  const [line, setLine] = useState<number | null>(null);
  const [typeSym, name] = id.split('|');
  const t = walk.types[typeSym];
  const m = t?.methods.find((x) => x.name === name);
  if (!t || !m) return null;
  return (
    <>
      <div className="card-h">
        <div className="gl" style={{ background: 'var(--k-func)' }}>
          ƒ
        </div>
        <h2>
          {t.name.split('.').pop()}.{name}
        </h2>
      </div>
      <div className="loc">
        {m.path}:{m.line} · {isPublic(name) ? 'exported' : 'internal'} · not on this walk's map
      </div>
      {m.doc ? (
        <p style={{ lineHeight: 1.6, margin: 0 }}>{m.doc}</p>
      ) : (
        <p className="empty">No doc comment.</p>
      )}
      <Sec h="In → out">
        <div className="sig">
          <span style={{ color: 'var(--muted)' }}>
            (<TypeLink symbol={typeSym} />){' '}
          </span>
          <LinkTypes text={m.sig} />
        </div>
      </Sec>
      <Rows errs={m.errs} gos={m.gos} locks={m.locks} onLine={setLine} />
      <Sec h="Code">
        <Code code={m.code} hl={[[line ?? m.line, line ?? m.line]]} reveal={line !== null} />
      </Sec>
    </>
  );
}

export function EdgeCard({ id }: { id: string }) {
  const { walk, wf, go } = useWalk();
  const e = wf?.edges.find((x) => x.id === id);
  if (!wf || !e) return null;
  const steps = wf.trace.map((s, i) => [s, i] as const).filter(([s]) => s.at === id);
  const ifs = (wf.whatifs ?? []).filter((x) => x.trace.some((s) => s.at === id));
  const kindName: Record<EdgeKind, string> = {
    call: 'Calls',
    when: 'Only when',
    go: 'Runs in background',
    stores: 'Stores',
    asks: 'Asks and waits',
  };
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
        {kindName[e.kind]}
        {e.cond ? ` · when ${e.cond}` : ''}
        {e.label ? ` · ${e.label}` : ''}
      </div>
      {steps.length > 0 && (
        <Sec h="Data crossing here (real run)">
          {steps.map(([s, i]) => (
            <p key={i} style={{ marginBottom: 6 }}>
              <a onClick={() => go.step(i, null)}>
                Step {i + 1}: {s.title} →
              </a>
            </p>
          ))}
        </Sec>
      )}
      {ifs.length > 0 && (
        <Sec h="This branch in a real run">
          {ifs.map((x) => (
            <p key={x.id} style={{ marginBottom: 8 }}>
              <button className="go" onClick={() => go.whatif(x.id)}>
                ▶ Trace this branch
              </button>{' '}
              <span style={{ color: 'var(--muted)' }}>
                what if {x.title}: {x.summary}
              </span>
            </p>
          ))}
        </Sec>
      )}
      {e.skip && (
        <Sec h="No trace for this branch">
          <p className="step-note">{e.skip}</p>
        </Sec>
      )}
      {e.at ? (
        <Sec h={`Where it happens · ${e.at.path}:${e.at.hl[0][0]}`}>
          <Code code={e.at} />
        </Sec>
      ) : (
        <p className="empty">
          This edge is not a line of Go code (it crosses into the UI, the provider or the database).
        </p>
      )}
    </>
  );
}
