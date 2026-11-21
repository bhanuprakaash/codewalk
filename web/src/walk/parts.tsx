import type { ReactNode } from 'react';
import { useWalk } from './ctx';
import { kc } from './graph';
import type { Err, Go, Why } from './types';

export function Sec({ h, children }: { h: ReactNode; children: ReactNode }) {
  return (
    <div className="sec">
      <div className="h">{h}</div>
      {children}
    </div>
  );
}

export function Chip({
  kind,
  glyph,
  onClick,
  title,
  children,
}: {
  kind: string;
  glyph: string;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className="chip" onClick={onClick} title={title}>
      <i style={{ background: kc(kind) }}>{glyph}</i>
      {children}
    </span>
  );
}

export function TypeLink({ symbol }: { symbol?: string | null }) {
  const { walk, go } = useWalk();
  const t = symbol ? walk.types[symbol] : null;
  return t ? <a onClick={() => go.type(symbol!)}>{t.name}</a> : null;
}

export function LinkTypes({ text }: { text: string }) {
  const { walk, go } = useWalk();
  const out: ReactNode[] = [];
  let i = 0;
  for (const m of text.matchAll(/\b(\w+)\.([A-Z]\w*)\b/g)) {
    const sym = Object.keys(walk.types).find((k) => walk.types[k].name === m[0]);
    if (!sym) continue;
    out.push(text.slice(i, m.index));
    out.push(
      <a key={m.index} onClick={() => go.type(sym)}>
        {m[0]}
      </a>,
    );
    i = m.index + m[0].length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

export function WhyBox({ why }: { why?: Why }) {
  if (!why) return null;
  const s = why.source;
  return (
    <div className="why">
      {why.text}
      <div className="src">
        {s.kind === 'inferred' ? (
          <>
            <span className="badge inferred">inferred</span> no written source
          </>
        ) : (
          <>
            <span className="badge cited">{s.kind}</span> {s.ref}
            {s.title ? ' · ' + s.title : ''}
          </>
        )}
      </div>
    </div>
  );
}

export function Rows({
  errs,
  gos,
  locks,
  selects,
  onLine,
}: {
  errs?: Err[];
  gos?: Go[];
  locks?: string[];
  selects?: { line: number; text: string }[];
  onLine(n: number): void;
}) {
  const line = (n: number, children: ReactNode, key: string) => (
    <div className="row" key={key} onClick={() => onLine(n)}>
      <span className="l">:{n}</span>
      <span className="c">{children}</span>
    </div>
  );
  const errRows = (errs ?? []).map((e) =>
    line(
      e.line,
      e.from ? (
        <>
          <em>when</em> {e.from}{' '}
          <em>{e.from.startsWith('<-') ? 'delivers an error' : 'fails'} → returns</em> {e.text}
        </>
      ) : (
        <>
          <em>returns</em> {e.text}
          {e.cond && (
            <>
              {' '}
              <em>when</em> {e.cond}
            </>
          )}
        </>
      ),
      'e' + e.line + e.text,
    ),
  );
  const conc = [
    ...(gos ?? []).map((g) =>
      line(
        g.line,
        <>
          <em>starts goroutine</em> go {g.callee || g.text}
        </>,
        'g' + g.line,
      ),
    ),
    ...(locks ?? []).map((m) => (
      <div className="row" key={'l' + m}>
        <span className="l">lock</span>
        <span className="c">
          <em>holds</em> {m}
        </span>
      </div>
    )),
    ...(selects?.length
      ? [
          line(
            selects[0].line,
            <>
              <em>select over</em> {selects.map((s) => s.text).join(' · ')}
            </>,
            's',
          ),
        ]
      : []),
  ];
  return (
    <>
      {errRows.length > 0 && (
        <Sec h={`Fails when · ${errRows.length}`}>
          <div className="rows">{errRows}</div>
        </Sec>
      )}
      {conc.length > 0 && (
        <Sec h="Concurrency">
          <div className="rows">{conc}</div>
        </Sec>
      )}
    </>
  );
}
