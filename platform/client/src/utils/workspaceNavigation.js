export function revealWorkspaceSection(hash, behavior = 'smooth') {
  if (!/^#[a-z][a-z0-9-]*$/.test(hash || '')) return false;
  const target = document.getElementById(hash.slice(1));
  if (!target) return false;
  for (let parent = target; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  const height = document.querySelector('.app-navigation')?.getBoundingClientRect().height || 160;
  target.style.scrollMarginTop = `${Math.ceil(height) + 16}px`;
  target.scrollIntoView?.({ behavior, block: 'start' });
  return true;
}
