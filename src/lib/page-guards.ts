import { getBrowser } from './browser-api';

export const EXTENSION_UI_ATTR = 'data-pulserefresh-ui';

/**
 * Feature: Prevent Form Resubmission
 * Neutralizes POST history entries via history.replaceState and checks whether
 * any form controls on the page contain unsaved user-entered data.
 */
export function hasDirtyFormFields(doc: Document = document): boolean {
  const elements = doc.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('form input, form textarea, form select');
  for (const el of Array.from(elements)) {
    if (el.closest(`[${EXTENSION_UI_ATTR}]`)) continue;
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) {
        continue;
      }
      if (type === 'checkbox' || type === 'radio') {
        if (el.checked !== el.defaultChecked) return true;
      } else if (el.value !== el.defaultValue && el.value.trim().length > 0) {
        return true;
      }
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.value !== el.defaultValue && el.value.trim().length > 0) {
        return true;
      }
    } else if (el instanceof HTMLSelectElement) {
      for (const opt of Array.from(el.options)) {
        if (opt.selected !== opt.defaultSelected) return true;
      }
    }
  }
  return false;
}

export function neutralizeFormResubmission(
  win: Window = window,
  doc: Document = document,
  options: { protectDirtyForms?: boolean } = {},
): { safeToReload: boolean; cleanGetUrl: string; reason?: string } {
  const cleanGetUrl = win.location.href;
  if (options.protectDirtyForms && hasDirtyFormFields(doc)) {
    return {
      safeToReload: false,
      cleanGetUrl,
      reason: 'dirty_form_protected',
    };
  }
  try {
    if (win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, doc.title, cleanGetUrl);
    }
  } catch {
    // Cross-origin or restricted document — background will still perform clean GET update
  }
  return { safeToReload: true, cleanGetUrl };
}

/**
 * Determine whether background reload should perform a clean GET navigation
 * (preventing browser "Confirm Form Resubmission" POST modal) vs standard tabs.reload.
 */
export function resolveReloadStrategy(params: {
  currentUrl: string;
  targetUrl?: string;
  hardRefresh: boolean;
  preventFormResubmission: boolean;
}):
  | { method: 'reload'; bypassCache: boolean }
  | { method: 'clean_get'; url: string; bypassCache: boolean } {
  const dest = params.targetUrl || params.currentUrl;
  if (params.targetUrl && params.targetUrl !== params.currentUrl) {
    return {
      method: 'clean_get',
      url: addCacheBusterIfNeeded(dest, params.hardRefresh),
      bypassCache: params.hardRefresh,
    };
  }
  if (params.preventFormResubmission && !params.hardRefresh) {
    return {
      method: 'clean_get',
      url: dest,
      bypassCache: false,
    };
  }
  if (params.preventFormResubmission && params.hardRefresh) {
    return {
      method: 'clean_get',
      url: addCacheBusterIfNeeded(dest, true),
      bypassCache: true,
    };
  }
  return {
    method: 'reload',
    bypassCache: params.hardRefresh,
  };
}

export function addCacheBusterIfNeeded(url: string, bust: boolean): string {
  if (!bust) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      parsed.searchParams.set('_pr_cb', String(Date.now()));
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Feature: Keep Page Active in Background
 * Overrides document.hidden, document.visibilityState, and document.hasFocus,
 * and intercepts throttling visibilitychange / blur events. Returns cleanup function.
 */
export function enableKeepPageActive(
  doc: Document = document,
  win: Window = window,
): () => void {
  const origHidden = Object.getOwnPropertyDescriptor(doc, 'hidden');
  const origVisibility = Object.getOwnPropertyDescriptor(
    doc,
    'visibilityState',
  );
  const origHasFocus = doc.hasFocus?.bind(doc);

  try {
    Object.defineProperty(doc, 'hidden', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(doc, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    doc.hasFocus = () => true;
  } catch {
    // Non-configurable property in exotic host
  }

  const blockVisibility = (event: Event) => {
    event.stopImmediatePropagation();
  };

  doc.addEventListener('visibilitychange', blockVisibility, true);
  doc.addEventListener('webkitvisibilitychange', blockVisibility, true);
  win.addEventListener('blur', blockVisibility, true);

  // Dispatch one synthetic visibilitychange so paused SPAs wake up immediately
  let active = true;

  return () => {
    if (!active) return;
    active = false;
    doc.removeEventListener('visibilitychange', blockVisibility, true);
    doc.removeEventListener('webkitvisibilitychange', blockVisibility, true);
    win.removeEventListener('blur', blockVisibility, true);

    try {
      if (origHidden) {
        Object.defineProperty(doc, 'hidden', origHidden);
      } else {
        delete (doc as unknown as Record<string, unknown>).hidden;
      }
      if (origVisibility) {
        Object.defineProperty(doc, 'visibilityState', origVisibility);
      } else {
        delete (doc as unknown as Record<string, unknown>).visibilityState;
      }
      if (origHasFocus) {
        doc.hasFocus = origHasFocus;
      }
    } catch {
      // Ignore cleanup errors
    }
  };
}

/**
 * Mark a browser tab as non-discardable in Chromium so background tabs stay alive.
 * Gracefully no-ops in Firefox where autoDiscardable may be unsupported.
 */
export async function setTabKeepActiveFlag(
  tabId: number,
  keepActive: boolean,
): Promise<boolean> {
  try {
    const b = getBrowser();
    await b.tabs.update(tabId, {
      autoDiscardable: !keepActive,
    } as Parameters<typeof b.tabs.update>[1]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Feature: Stop on User Interaction
 * Attaches capture-phase listeners for genuine user events (mousedown, keydown,
 * wheel, touchstart), ignoring events originating inside PulseRefresh UI overlays.
 */
export function attachUserInteractionDetector(
  onInteract: (eventType: string) => void,
  options: {
    target?: Document;
    events?: Array<'mousedown' | 'keydown' | 'wheel' | 'touchstart'>;
    ignoreHotkeys?: boolean;
  } = {},
): () => void {
  const doc = options.target ?? document;
  const events = options.events ?? [
    'mousedown',
    'keydown',
    'wheel',
    'touchstart',
  ];
  let triggered = false;

  const handler = (event: Event) => {
    if (triggered) return;

    // Ignore events fired on extension Shadow-DOM hosts or UI helpers
    const targetNode = event.target as Element | null;
    if (targetNode && typeof targetNode.closest === 'function') {
      if (
        targetNode.closest(`[${EXTENSION_UI_ATTR}]`) ||
        targetNode.tagName?.toLowerCase() === 'pulserefresh-timer'
      ) {
        return;
      }
    }

    // Ignore modifier-only hotkey chords (Alt+Shift+...) when ignoreHotkeys is true
    if (options.ignoreHotkeys !== false && event instanceof KeyboardEvent) {
      if (event.altKey && event.shiftKey) return;
      if (['Alt', 'Shift', 'Control', 'Meta'].includes(event.key)) return;
    }

    triggered = true;
    cleanup();
    onInteract(event.type);
  };

  for (const evt of events) {
    doc.addEventListener(evt, handler, { capture: true, passive: true });
  }

  const cleanup = () => {
    for (const evt of events) {
      doc.removeEventListener(evt, handler, { capture: true });
    }
  };

  return cleanup;
}
