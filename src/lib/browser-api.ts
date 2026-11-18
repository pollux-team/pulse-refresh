import { browser as wxtBrowser } from 'wxt/browser';

export type BrowserLike = typeof wxtBrowser;

let previewOverride: BrowserLike | null = null;

/**
 * Allows the standalone Vite UI preview workbench to attach an in-memory
 * WebExtension shim when running outside Chrome/Firefox extension context.
 */
export function setBrowserOverride(override: BrowserLike | null): void {
  previewOverride = override;
}

export function getBrowser(): BrowserLike {
  if (previewOverride) return previewOverride;
  return wxtBrowser;
}

export function isExtensionContext(): boolean {
  if (previewOverride) return true;
  try {
    return Boolean(wxtBrowser?.runtime?.id || wxtBrowser?.storage?.local);
  } catch {
    return false;
  }
}
