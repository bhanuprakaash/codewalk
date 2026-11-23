import { STATIC } from '../static';
import type { User } from './types';

export const loadUser = (query: string): Promise<User> =>
  fetch(`/api/user?${query}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((u: unknown): User => (u && typeof u === 'object' ? (u as User) : {}));

// a read-only copy keeps nothing: a moved box stays put until the page reloads
export const patchUser = (query: string, patch: object) =>
  STATIC
    ? Promise.resolve(true)
    : fetch(`/api/user?${query}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }).then(
        (r) => r.ok,
        () => false,
      );
