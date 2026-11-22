import { useEffect, useRef, useState } from 'react';
import { KIND } from './graph';
import { BoxIcon } from './icons';
import type { Step, Walk, WhatIf, Workflow } from './types';

export const Tag = ({ step }: { step: Step }) => (
  <span className={`tag-pill ${step.tone ?? 'info'}`}>{step.tag}</span>
);

const EDGES: [string, string, string[]][] = [
  ['imports', 'Imports', ['imports']],
  ['call', 'Calls', ['call', 'calls']],
  ['http', 'HTTP · MCP', ['http', 'mcp']],
  ['sse', 'SSE', ['sse']],
  ['when', 'Only when', ['when']],
  ['go', 'Runs in background', ['go']],
  ['stores', 'Stores', ['stores']],
  ['asks', 'Asks and waits', ['asks']],
];
const SYSTEM_NAMES: Record<string, string> = {
  package: 'Go package',
  ui: 'UI',
  service: 'Service',
  store: 'Data',
  outside: 'Outside',
};

export function Legend({
  kinds,
  edges,
  system,
}: {
  kinds: string[];
  edges: string[];
  system?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current?.contains(e.target as Node) || setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc, true);
    return () => {
      removeEventListener('pointerdown', away);
      removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div id="legend" ref={box}>
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        Legend
      </button>
      {open && (
        <div className="pop">
          {Object.keys(system ? SYSTEM_NAMES : KIND)
            .filter((k) => kinds.includes(k))
            .map((k) => (
              <span className="it" key={k}>
                <BoxIcon kind={k} size={22} />
                {system ? SYSTEM_NAMES[k] : KIND[k as keyof typeof KIND].name}
              </span>
            ))}
          <span className="it">
            <span className="chg-sw" aria-hidden="true" />
            Changed
          </span>
          <span className="bar" />
          {EDGES.filter(([, , ks]) => ks.some((k) => edges.includes(k))).map(([k, name]) => (
            <span className={`it edge ${k}`} key={k}>
              <svg width="30" height="10">
                <path className="ln" d="M1,5 L27,5" fill="none" markerEnd="url(#ar)" />
              </svg>
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Summary({
  wf,
  flows,
  onFlow,
}: {
  wf: Workflow;
  flows?: Workflow[];
  onFlow(id: string): void;
}) {
  const [short, setShort] = useState(true);
  return (
    <div id="summary" className={short ? 'short' : ''}>
      <b>{wf.title}</b>
      <div className="m">
        {wf.nodes.length} nodes · {wf.edges.length} connections
        {wf.trace.length ? ` · ${wf.trace.length} trace steps` : ''}
        {wf.whatifs?.length ? ` · ${wf.whatifs.length} what-ifs` : ''}
        {flows?.length ? ` · ${flows.length} flows` : ''}
      </div>
      {wf.summary && <p>{wf.summary}</p>}
      {wf.summary && (
        <a className="more" onClick={() => setShort(!short)}>
          {short ? 'View more' : 'View less'}
        </a>
      )}
      {!!flows?.length && (
        <div className="flows">
          {flows.map((f) => (
            <button key={f.id} className="flow" title={f.summary} onClick={() => onFlow(f.id)}>
              <span className="pl" aria-hidden="true">
                ▶
              </span>
              <span className="ft">{f.title}</span>
              <span className="fn">{f.trace.length}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Tracebar({
  code,
  walk,
  wf,
  whatif,
  trace,
  tr,
  onTrace,
  onStop,
}: {
  code: boolean;
  walk: Walk;
  wf: Workflow;
  whatif: WhatIf | undefined;
  trace: Step[];
  tr: number;
  onTrace(i: number): void;
  onStop(): void;
}) {
  if (!wf.trace.length) return null;
  if (tr < 0) {
    return (
      <div id="tracebar">
        <button className="go" onClick={() => onTrace(0)}>
          ▶ {code ? 'Trace a real run' : 'Play the flow'}
        </button>
        <span className="n">
          {wf.trace.length} steps
          {code
            ? ` · captured ${wf.capturedAt || walk.capturedAt}`
            : wf.whatifs?.length
              ? ` · ${wf.whatifs.length} what-if${wf.whatifs.length > 1 ? 's' : ''}`
              : ''}
        </span>
      </div>
    );
  }
  const title = (whatif ? `what if ${whatif.title} · ` : '') + trace[tr].title;
  return (
    <div id="tracebar">
      <button title="Previous (←)" onClick={() => onTrace(tr - 1)}>
        ◀
      </button>
      <span className="n c">
        {tr + 1} / {trace.length}
      </span>
      <span className="t" title={title}>
        {whatif && <span style={{ color: 'var(--data)' }}>what if {whatif.title} · </span>}
        {trace[tr].title}
      </span>
      {trace[tr].tag && <Tag step={trace[tr]} />}
      <button title="Next (→)" onClick={() => onTrace(tr + 1)}>
        ▶
      </button>
      <button title={whatif ? 'Back to the main trace (Esc)' : 'Stop (Esc)'} onClick={onStop}>
        ✕
      </button>
    </div>
  );
}
