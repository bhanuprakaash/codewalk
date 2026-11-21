import { useWalk, type Goto } from './ctx';
import { Chip, Sec } from './parts';
import type { Walk } from './types';

export function openSymbol(walk: Walk, go: Goto, symbol: string) {
  const node = Object.values(walk.nodes).find((n) => n.symbol === symbol);
  if (node) return go.node(node.id);
  if (walk.types[symbol]) return go.type(symbol);
  const [dir, key] = symbol.split(':');
  const [type, method] = key.split('.');
  if (method && walk.types[`${dir}:${type}`]) return go.method(`${dir}:${type}`, method);
  if (walk.funcs?.[symbol]) go.func(symbol);
}

export function Patterns() {
  const { walk, go } = useWalk();
  const pats = walk.patterns ?? [];
  if (!pats.length) return <p className="empty">No Go patterns found in the scanned packages.</p>;
  return (
    <>
      {pats.map((p) => (
        <Sec key={p.id} h={`${p.name} · ${p.sites.length}`}>
          <p style={{ lineHeight: 1.55, margin: '0 0 8px' }}>{p.what}</p>
          <div className="pills">
            {p.sites.map((s) => (
              <Chip
                key={s.symbol}
                kind={walk.types[s.symbol] ? 'type' : 'func'}
                glyph={walk.types[s.symbol] ? 'T' : 'ƒ'}
                title={s.symbol}
                onClick={() => openSymbol(walk, go, s.symbol)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </Sec>
      ))}
    </>
  );
}

export function PatternsCard() {
  return (
    <>
      <div className="card-h">
        <h2>Go patterns</h2>
      </div>
      <div className="loc">found by scan in the packages on this view</div>
      <Patterns />
    </>
  );
}
