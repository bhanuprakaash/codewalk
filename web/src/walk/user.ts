export const patchUser = (query: string, patch: object) =>
  fetch(`/api/user?${query}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(
    (r) => r.ok,
    () => false,
  );
