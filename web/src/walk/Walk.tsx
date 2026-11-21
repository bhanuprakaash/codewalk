import { useEffect, useState } from 'react';
import { Explorer } from './Explorer';
import { loadUser } from './user';
import type { User, Walk as WalkData } from './types';

type Loaded = { walk: WalkData; user: User } | { error: string } | null;

export function Walk({
  project,
  scope,
  view,
  onView,
}: {
  project: string;
  scope: string;
  view: string;
  onView(v: string): void;
}) {
  const [data, setData] = useState<Loaded>(null);
  const query = `project=${encodeURIComponent(project)}&scope=${encodeURIComponent(scope)}`;

  useEffect(() => {
    let live = true;
    setData(null);
    (async () => {
      const res = await fetch(`/api/walk?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { error: body?.error ?? res.statusText };
      }
      const walk = await res.json();
      return { walk, user: await loadUser(query) };
    })()
      .catch(() => ({ error: 'Could not reach the codewalk server. Is it running?' }))
      .then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [query]);

  if (!data) return <p className="note">Opening the walk…</p>;
  if ('error' in data) {
    return (
      <div className="notice">
        <h2>Nothing to show yet</h2>
        <p>{data.error}</p>
      </div>
    );
  }
  return (
    <Explorer
      key={query}
      walk={data.walk}
      user={data.user}
      query={query}
      view={view}
      onView={onView}
    />
  );
}
