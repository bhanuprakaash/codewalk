import { useEffect, useState } from 'react';
import { Sec } from './parts';

export interface Change {
  state: 'changed' | 'removed';
  diff?: string[];
  files?: string[];
}
export interface Changes {
  base: string;
  head: string;
  changes: Record<string, Change>;
}

export function useChanges(query: string) {
  const [res, setRes] = useState<Changes | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/changes?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d) => live && setRes(d),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [query]);
  const clear = () => res && setRes({ ...res, base: res.head, changes: {} });
  return { res, clear };
}

export function ChangeSec({ change, base }: { change?: Change; base: string }) {
  if (!change) return null;
  const since = `since ${base.slice(0, 7)}`;
  if (change.state === 'removed')
    return (
      <Sec h={`Removed ${since}`}>
        <p className="empty">This symbol is gone at the repo's HEAD.</p>
      </Sec>
    );
  return (
    <Sec h={`Changed ${since}`}>
      {change.files && (
        <div className="rows">
          {change.files.map((f) => (
            <div className="row" key={f}>
              <span className="c">{f}</span>
            </div>
          ))}
        </div>
      )}
      {change.diff && (
        <pre className="diff">
          {change.diff.map((l, i) => (
            <div key={i} className={l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'hunk'}>
              {l}
            </div>
          ))}
        </pre>
      )}
    </Sec>
  );
}

export function SeenButton({ res, onSeen }: { res: Changes | null; onSeen(head: string): void }) {
  const n = res ? Object.keys(res.changes).length : 0;
  if (!res || !n) return null;
  return (
    <button
      title={`Changes ${res.base.slice(0, 7)} → ${res.head.slice(0, 7)}`}
      onClick={() => onSeen(res.head)}
    >
      Mark seen · {n} changed
    </button>
  );
}
