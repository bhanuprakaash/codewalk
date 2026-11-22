import type { ReactNode } from 'react';
import { useWalk } from './ctx';
import { BoxIcon } from './icons';
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
  onClick,
  title,
  children,
}: {
  kind: string;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className="chip" onClick={onClick} title={title}>
      <BoxIcon kind={kind} size={18} />
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
  if (s.kind === 'map') return <div className="why">{why.text}</div>;
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

const TAGS = new Set(['P', 'B', 'I', 'EM', 'STRONG', 'CODE', 'PRE', 'UL', 'OL', 'LI', 'BR', 'A']);

// keeps the few tags a map node's body may use; drops every attribute but a link's http(s) href
function clean(node: Node) {
  for (const kid of [...node.childNodes]) {
    if (kid.nodeType === Node.TEXT_NODE) continue;
    if (kid.nodeType !== Node.ELEMENT_NODE) {
      kid.remove();
      continue;
    }
    const el = kid as Element;
    clean(el);
    if (!TAGS.has(el.tagName)) {
      el.replaceWith(...(['SCRIPT', 'STYLE'].includes(el.tagName) ? [] : el.childNodes));
      continue;
    }
    const href = el.getAttribute('href');
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (el.tagName === 'A' && href && /^https?:\/\//.test(href)) {
      el.setAttribute('href', href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

export function Html({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  clean(doc.body);
  return <div className="html" dangerouslySetInnerHTML={{ __html: doc.body.innerHTML }} />;
}
