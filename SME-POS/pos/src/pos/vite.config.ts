import type { TenantTheme } from '../types/contract';

/**
 * White-label on the till. The tenant's theme arrives with the device session
 * (/pos/session), the same branding an owner sets in the dashboard. We apply the
 * primary colour to a CSS variable that the till's primary actions read, so a
 * merchant's brand shows through here too — not just Wivae blue.
 *
 * Colours are validated to a hex literal before use; the dashboard already
 * stores only validated hex, this is defence in depth.
 */
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function brandPrimary(theme: TenantTheme | undefined): string | null {
  const value = theme?.primary;
  return typeof value === 'string' && HEX.test(value) ? value : null;
}

export function applyBrandTheme(theme: TenantTheme | undefined): void {
  const primary = brandPrimary(theme);
  if (primary) {
    document.documentElement.style.setProperty('--brand', primary);
  }
}
