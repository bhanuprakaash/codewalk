import { KIND } from './graph';
import { Chip } from './parts';
import { Patterns } from './patterns';
import type { Walk } from './types';

export function Overview({
  walk,
  onWorkflow,
  onNode,
  onType,
}: {
  walk: Walk;
  onWorkflow(id: string): void;
  onNode(id: string): void;
  onType(symbol: string): void;
}) {
  return (
    <div id="overview">
      <div className="ov-h">{walk.scope} · summary</div>
      <p style={{ maxWidth: 760, margin: '0 0 24px', lineHeight: 1.6, color: 'var(--muted)' }}>
        {walk.summary}
      </p>
      <div className="ov-h">Workflows</div>
      <div className="wf-row">
        {walk.workflows.map((w) => (
          <div className="wf" key={w.id} onClick={() => onWorkflow(w.id)}>
            <b>{w.title}</b>
            <div className="m">
              {w.nodes.length} nodes
              {w.trace.length ? ` · ${w.trace.length} trace steps from a real run` : ''}
            </div>
            <p>{w.summary}</p>
          </div>
        ))}
      </div>
      <div className="ov-h">Packages</div>
      <div className="clusters">
        {walk.packages.map((p) => (
          <div className="cluster" key={p.dir}>
            <div className="t">
              {p.dir}/<span>{p.nodes.length}</span>
            </div>
            <p>{p.role || p.doc}</p>
            <div className="chips">
              {p.nodes.map((id) => (
                <Chip
                  key={id}
                  kind={walk.nodes[id].kind}
                  glyph={KIND[walk.nodes[id].kind].g}
                  onClick={() => onNode(id)}
                >
                  {walk.nodes[id].label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ov-h" style={{ marginTop: 26 }}>
        Go patterns
      </div>
      <div className="ov-patterns">
        <Patterns />
      </div>
      <div className="ov-h" style={{ marginTop: 26 }}>
        Types
      </div>
      <div className="chips">
        {Object.values(walk.types).map((t) => (
          <Chip key={t.symbol} kind="type" glyph="T" onClick={() => onType(t.symbol)}>
            {t.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
