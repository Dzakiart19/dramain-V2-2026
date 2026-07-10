/**
 * Ikon monokrom (inline SVG, stroke="currentColor") — tidak ada emoji
 * di seluruh aplikasi. Setiap ikon adalah fungsi supaya bisa dipakai
 * berulang tanpa duplikasi markup.
 */
export const icon = {
  logo: () => `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M4 6h16M4 12h16M4 18h10" stroke-linecap="round"/>
      <circle cx="19" cy="18" r="2.4"/>
    </svg>`,
  search: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="10.5" cy="10.5" r="6.5"/>
      <path d="M20 20l-4.7-4.7" stroke-linecap="round"/>
    </svg>`,
  close: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 5l14 14M19 5L5 19" stroke-linecap="round"/>
    </svg>`,
  back: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  chevronLeft: () => `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
      <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  chevronRight: () => `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
      <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  play: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M6 4.5v15l13-7.5-13-7.5z"/>
    </svg>`,
  playCircle: () => `
    <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.4">
      <circle cx="12" cy="12" r="10"/>
      <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none"/>
    </svg>`,
  lock: () => `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="5" y="11" width="14" height="9" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke-linecap="round"/>
    </svg>`,
  film: () => `
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5" stroke-linecap="round"/>
    </svg>`,
  alert: () => `
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v5" stroke-linecap="round"/>
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none"/>
    </svg>`,
  info: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 11v5" stroke-linecap="round"/>
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/>
    </svg>`,
  check: () => `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
      <path d="M5 12.5l4.5 4.5L19 7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  nextEpisode: () => `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 5l9 7-9 7V5z" fill="currentColor" stroke="none"/>
      <path d="M17 5v14" stroke-linecap="round"/>
    </svg>`,
};
