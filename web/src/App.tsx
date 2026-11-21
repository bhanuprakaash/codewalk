import { useEffect, useState } from 'react';

type Project = { name: string; scopes: string[] };
type Selection = { project: string; scope: string };

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then(setProjects)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>codewalk</h1>
        {failed && <p className="note">Could not load projects. Is codewalk running?</p>}
        {projects?.length === 0 && <p className="note">No projects in ~/.codewalk yet.</p>}
        {projects?.map((p) => (
          <section key={p.name}>
            <h2>{p.name}</h2>
            <ul>
              {p.scopes.map((scope) => (
                <li key={scope}>
                  <button
                    className={
                      selected?.project === p.name && selected.scope === scope ? 'active' : ''
                    }
                    onClick={() => setSelected({ project: p.name, scope })}
                  >
                    {scope}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <main className="main">
        {selected ? <h2>{selected.scope}</h2> : <p className="note">Pick a scope on the left.</p>}
      </main>
    </div>
  );
}
