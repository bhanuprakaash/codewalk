import { useEffect, useState } from 'react';
import { Explorer } from './Explorer';
import type { User, Walk as WalkData } from './types';

type Loaded = { walk: WalkData; user: User } | { error: string } | null;

// loads one walk and its user.json, then hands them to the explorer
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
      const user = await fetch(`/api/user?${query}`).then(
        (r) => (r.ok ? r.json() : {}),
        () => ({}),
      );
      return { walk, user };
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
