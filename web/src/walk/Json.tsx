import type { ReactNode } from 'react';

export const valueText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function paths(v: unknown, base = '', out = new Map<string, string>()) {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) paths(o[k], base + '/' + k, out);
    if (!Object.keys(o).length) out.set(base, JSON.stringify(v));
  } else out.set(base, JSON.stringify(v));
  return out;
}

export function Json({ value, prev }: { value: unknown; prev?: unknown }) {
  if (typeof value === 'string') {
    return <span className={prev !== undefined && prev !== value ? 's chg' : 's'}>{value}</span>;
  }
  const before = prev && typeof prev === 'object' ? paths(prev) : null;
  const walk = (x: unknown, path: string, ind: number): ReactNode => {
    if (x && typeof x === 'object') {
      const arr = Array.isArray(x);
      const o = x as Record<string, unknown>;
      const ks = Object.keys(o);
      if (!ks.length) return arr ? '[]' : '{}';
      const pad = '  '.repeat(ind);
      return (
        <>
          {arr ? '[\n' : '{\n'}
          {ks.map((k, i) => (
            <span key={k}>
              {pad + '  '}
              {!arr && <span className="k">"{k}"</span>}
              {!arr && ': '}
              {walk(o[k], path + '/' + k, ind + 1)}
              {(i < ks.length - 1 ? ',' : '') + '\n'}
            </span>
          ))}
          {pad + (arr ? ']' : '}')}
        </>
      );
    }
    const s = JSON.stringify(x);
    const changed = before !== null && before.get(path) !== s;
    return (
      <span className={(typeof x === 'string' ? 's' : 'n') + (changed ? ' chg' : '')}>{s}</span>
    );
  };
  return <>{walk(value, '', 0)}</>;
}
