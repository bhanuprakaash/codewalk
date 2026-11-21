import { useState } from 'react';
import { KIND, kc } from './graph';
import type { EdgeKind, Step, Walk, WhatIf, Workflow } from './types';

const EDGES: [EdgeKind, string, string][] = [
  ['call', 'Calls', ''],
  ['when', 'Only when', '2 4'],
  ['go', 'Runs in background', '7 5'],
  ['stores', 'Stores', ''],
  ['asks', 'Asks and waits', ''],
];
const edgeColour = (k: EdgeKind) =>
  k === 'stores' ? 'var(--k-store)' : k === 'asks' ? 'var(--you)' : 'var(--muted)';

export function Legend() {
  return (
    <div id="legend">
      {Object.entries(KIND).map(([k, v]) => (
        <span className="it" key={k}>
          <span className="gl" style={{ background: kc(k) }}>
            {v.g}
          </span>
          {v.name}
        </span>
      ))}
      <span className="bar" />
      {EDGES.map(([k, name, dash]) => (
        <span className="it" key={k}>
          <svg width="30" height="10">
            <path
              d="M1,5 L27,5"
              stroke={edgeColour(k)}
              strokeWidth="1.6"
              fill="none"
              strokeDasharray={dash}
              markerEnd="url(#ar)"
            />
          </svg>
          {name}
        </span>
      ))}
    </div>
  );
}

export function Summary({ wf }: { wf: Workflow }) {
  const [short, setShort] = useState(true);
  return (
    <div id="summary" className={short ? 'short' : ''}>
      <b>{wf.title}</b>
      <div className="m">
        {wf.nodes.length} nodes · {wf.edges.length} connections
        {wf.trace.length ? ` · ${wf.trace.length} trace steps` : ''}
        {wf.whatifs?.length ? ` · ${wf.whatifs.length} what-ifs` : ''}
      </div>
      <p>{wf.summary}</p>
      <a onClick={() => setShort(!short)}>{short ? 'View more' : 'View less'}</a>
    </div>
  );
}

export function Tracebar({
  walk,
  wf,
  whatif,
  trace,
  tr,
  onTrace,
  onStop,
}: {
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
          ▶ Trace a real run
        </button>
        <span className="n">
          {wf.trace.length} steps · captured {wf.capturedAt || walk.capturedAt}
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
      <button title="Next (→)" onClick={() => onTrace(tr + 1)}>
        ▶
      </button>
      <button title={whatif ? 'Back to the main trace (Esc)' : 'Stop (Esc)'} onClick={onStop}>
        ✕
      </button>
    </div>
  );
}
