export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('codewalk:theme', next);
  } catch {
    // private mode: the choice lasts until reload
  }
}
