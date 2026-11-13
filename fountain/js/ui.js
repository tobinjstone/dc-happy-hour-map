// Little HTML pieces used across the page and its dialogs.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Fizz as five bubbles, filled up to the rating.
export function fizzHtml(n, { size = 'sm' } = {}) {
  const full = Math.round(n || 0);
  return `<span class="fizz-bubbles fizz-${size}" role="img" aria-label="Fizz ${n || 0} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= full ? 'on' : ''}"></i>`).join('')}</span>`;
}

// The chain's short name on a dark label, like a soda fountain button.
export function chipHtml(chain) {
  return `<span class="chain-chip${chain.spot ? ' is-spot' : ''}" aria-hidden="true">${esc(chain.short)}</span>`;
}

export const fmtMiles = (m) => (m < 0.1 ? `${Math.max(50, Math.round((m * 5280) / 50) * 50)} ft` : m < 10 ? `${m.toFixed(1)} mi` : `${Math.round(m)} mi`);
