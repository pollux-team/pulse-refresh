import { queryXPathElements } from './expression-engine';
import { EXTENSION_UI_ATTR } from './page-guards';
import type { AutoClickTarget } from './types';

export const HIGHLIGHT_ATTR = 'data-pulserefresh-highlight';
export const OUTLINE_ATTR = 'data-pulserefresh-outline';

/**
 * Feature: Monitor Custom Page Area — Resolve container via CSS selector or XPath.
 */
export function resolveCustomAreaElement(
  root: Document | Element,
  selector: string,
  selectorType: 'css' | 'xpath' = 'css',
): Element | null {
  const clean = selector.trim();
  if (!clean) return null;

  if (selectorType === 'xpath' || /^xpath:/i.test(clean)) {
    const xp = clean.replace(/^xpath:/i, '').trim();
    return queryXPathElements(root, xp)[0] ?? null;
  }

  try {
    return root.querySelector(clean.replace(/^css:/i, '').trim());
  } catch {
    return null;
  }
}

/**
 * Build a crisp, stable, unique CSS selector for any clicked DOM element.
 */
export function generateUniqueCssSelector(el: Element): string {
  const doc = el.ownerDocument;
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
    const escapedId = `#${el.id}`;
    if (doc.querySelectorAll(escapedId).length === 1) {
      return escapedId;
    }
  }

  // Prefer stable test/semantic data attributes
  for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-id', 'name']) {
    const val = el.getAttribute(attr);
    if (val && !val.includes('"')) {
      const candidate = `${el.tagName.toLowerCase()}[${attr}="${val}"]`;
      if (doc.querySelectorAll(candidate).length === 1) {
        return candidate;
      }
    }
  }

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== doc.body) {
    if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
      parts.unshift(`#${current.id}`);
      break;
    }

    let segment = current.tagName.toLowerCase();
    const stableClasses = Array.from(current.classList)
      .filter((c) => /^[a-zA-Z][\w-]{1,32}$/.test(c) && !/^(hover|focus|active)/.test(c))
      .slice(0, 2);

    if (stableClasses.length > 0) {
      segment += `.${stableClasses.join('.')}`;
    }

    const parentEl: Element | null = current.parentElement;
    if (parentEl) {
      const currentTag = current.tagName;
      const sameTagSiblings = Array.from(parentEl.children).filter(
        (sib: Element) => sib.tagName === currentTag,
      );
      if (sameTagSiblings.length > 1) {
        const idx = sameTagSiblings.indexOf(current) + 1;
        segment += `:nth-of-type(${idx})`;
      }
    }

    parts.unshift(segment);
    const candidate = parts.join(' > ');
    try {
      if (doc.querySelectorAll(candidate).length === 1) {
        return candidate;
      }
    } catch {
      // Keep walking upward
    }
    current = parentEl;
  }

  return parts.join(' > ') || el.tagName.toLowerCase();
}

/**
 * Feature: Monitor Custom Page Area — Interactive on-page Visual Element Picker.
 * Highlights hovered DOM elements with a live selector badge; click selects, Escape cancels.
 */
export function startInteractiveElementPicker(params: {
  doc?: Document;
  onSelect: (result: { selector: string; previewText: string; element: Element }) => void;
  onCancel?: () => void;
}): () => void {
  const doc = params.doc ?? document;

  const overlay = doc.createElement('div');
  overlay.setAttribute(EXTENSION_UI_ATTR, 'picker-overlay');
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderRadius: '4px',
    zIndex: '2147483646',
    transition: 'all 60ms ease-out',
    display: 'none',
  });

  const banner = doc.createElement('div');
  banner.setAttribute(EXTENSION_UI_ATTR, 'picker-banner');
  Object.assign(banner.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    padding: '8px 14px',
    borderRadius: '9999px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });
  banner.textContent =
    'PulseRefresh: Click any element to monitor it (Press Esc to cancel)';

  doc.body.appendChild(overlay);
  doc.body.appendChild(banner);

  let hovered: Element | null = null;

  const isIgnored = (target: EventTarget | null): target is Element => {
    if (!(target instanceof Element)) return true;
    return (
      target === doc.documentElement ||
      Boolean(target.closest(`[${EXTENSION_UI_ATTR}]`)) ||
      target.tagName.toLowerCase() === 'pulserefresh-timer'
    );
  };

  const onMouseMove = (e: MouseEvent) => {
    if (isIgnored(e.target)) return;
    hovered = e.target as Element;
    const rect = hovered.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const sel = generateUniqueCssSelector(hovered);
    banner.textContent = `Select: ${sel}  (Esc to cancel)`;
  };

  const onClick = (e: MouseEvent) => {
    if (isIgnored(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const target = (hovered ?? e.target) as Element;
    const selector = generateUniqueCssSelector(target);
    const previewText = (target.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    cleanup();
    params.onSelect({ selector, previewText, element: target });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      params.onCancel?.();
    }
  };

  doc.addEventListener('mousemove', onMouseMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);

  function cleanup() {
    doc.removeEventListener('mousemove', onMouseMove, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    banner.remove();
  }

  return cleanup;
}

/**
 * Feature: Highlight Detected Keyword
 * Wraps matching substrings in text nodes inside <mark data-pulserefresh-highlight>
 * and optionally outlines matched CSS/XPath elements. Reversible via clearHighlights().
 */
export function clearHighlights(root: Document | Element = document): void {
  const doc = root instanceof Document ? root : root.ownerDocument;
  root.querySelectorAll(`mark[${HIGHLIGHT_ATTR}]`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(doc.createTextNode(mark.textContent || ''), mark);
    parent.normalize();
  });

  root.querySelectorAll<HTMLElement>(`[${OUTLINE_ATTR}]`).forEach((el) => {
    el.style.outline = el.getAttribute('data-pr-prev-outline') || '';
    el.removeAttribute('data-pr-prev-outline');
    el.removeAttribute(OUTLINE_ATTR);
  });
}

export function highlightDetectedKeywords(params: {
  root: Element;
  keywords: string[];
  matchedElements?: Element[];
  color?: string;
  caseSensitive?: boolean;
  maxHighlights?: number;
}): HTMLElement[] {
  const {
    root,
    keywords,
    matchedElements = [],
    color = '#fde047',
    caseSensitive = false,
    maxHighlights = 100,
  } = params;

  const doc = root.ownerDocument;
  clearHighlights(root);

  const created: HTMLElement[] = [];

  // 1. Outline directly matched CSS/XPath elements
  for (const el of matchedElements) {
    if (el instanceof HTMLElement && created.length < maxHighlights) {
      el.setAttribute('data-pr-prev-outline', el.style.outline || '');
      el.setAttribute(OUTLINE_ATTR, 'true');
      el.style.outline = `3px solid ${color}`;
      created.push(el);
    }
  }

  // 2. Highlight matched keyword strings inside visible text nodes
  const validTerms = Array.from(
    new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 0)),
  );
  if (validTerms.length === 0) return created;

  const escaped = validTerms
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, caseSensitive ? 'g' : 'gi');

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (
        ['script', 'style', 'noscript', 'textarea', 'mark'].includes(tag) ||
        parent.closest(`[${EXTENSION_UI_ATTR}]`)
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    textNodes.push(current as Text);
  }

  for (const textNode of textNodes) {
    if (created.length >= maxHighlights) break;
    const content = textNode.nodeValue || '';
    regex.lastIndex = 0;
    if (!regex.test(content)) continue;

    regex.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null && created.length < maxHighlights) {
      if (match.index > lastIndex) {
        frag.appendChild(doc.createTextNode(content.slice(lastIndex, match.index)));
      }
      const mark = doc.createElement('mark');
      mark.setAttribute(HIGHLIGHT_ATTR, 'true');
      Object.assign(mark.style, {
        backgroundColor: color,
        color: '#0f172a',
        padding: '1px 3px',
        borderRadius: '3px',
        boxShadow: '0 0 0 1px rgba(15,23,42,0.2)',
        fontWeight: '600',
      });
      mark.textContent = match[0];
      frag.appendChild(mark);
      created.push(mark);
      lastIndex = match.index + match[0].length;
      if (match[0].length === 0) break;
    }

    if (lastIndex < content.length) {
      frag.appendChild(doc.createTextNode(content.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return created;
}

/**
 * Feature: Scroll to Keyword
 * Smoothly scrolls the target highlighted element into view and applies a focus ring.
 */
export function scrollToDetectedElement(
  elements: Element[],
  index = 0,
): Element | null {
  if (elements.length === 0) return null;
  const safeIndex = ((index % elements.length) + elements.length) % elements.length;
  const target = elements[safeIndex];
  if (!target) return null;

  if (typeof target.scrollIntoView === 'function') {
    try {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    } catch {
      target.scrollIntoView();
    }
  }

  if (target instanceof HTMLElement) {
    target.setAttribute('data-pulserefresh-scrolled', 'true');
  }

  return target;
}

/**
 * Dispatch realistic pointer + mouse + click events on an element so both vanilla
 * handlers and React/Vue synthetic listeners respond reliably.
 */
export function dispatchRealisticClick(element: Element): boolean {
  const htmlEl = element as HTMLElement;
  if (
    'disabled' in htmlEl &&
    Boolean((htmlEl as HTMLButtonElement).disabled)
  ) {
    return false;
  }

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
  };

  if (typeof PointerEvent !== 'undefined') {
    element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  }
  element.dispatchEvent(new MouseEvent('mousedown', eventInit));
  if (typeof htmlEl.focus === 'function') {
    htmlEl.focus({ preventScroll: true });
  }
  if (typeof PointerEvent !== 'undefined') {
    element.dispatchEvent(new PointerEvent('pointerup', eventInit));
  }
  element.dispatchEvent(new MouseEvent('mouseup', eventInit));

  if (typeof htmlEl.click === 'function') {
    htmlEl.click();
  } else {
    element.dispatchEvent(new MouseEvent('click', eventInit));
  }

  return true;
}

/**
 * Find the nearest clickable element for a matched highlight/node.
 */
export function findClickableTarget(el: Element): Element {
  const clickableSelector =
    'a[href], button, input[type="submit"], input[type="button"], [role="button"], [onclick], label';
  if (el.matches(clickableSelector)) return el;
  const ancestor = el.closest(clickableSelector);
  if (ancestor) return ancestor;
  // Unwrap our <mark> to return its parent element if needed
  if (el.hasAttribute(HIGHLIGHT_ATTR) && el.parentElement) {
    return el.parentElement.closest(clickableSelector) ?? el.parentElement;
  }
  return el;
}

/**
 * Feature: Auto-click on Keyword Match
 */
export async function autoClickOnKeywordMatch(params: {
  doc: Document;
  matchedElements: Element[];
  companionSelector?: string;
  delayMs?: number;
  alreadyClickedCount?: number;
  maxAutoClicks?: number;
}): Promise<{ clicked: boolean; clickedElement: Element | null; reason?: string }> {
  const maxClicks = params.maxAutoClicks ?? 1;
  const already = params.alreadyClickedCount ?? 0;
  if (maxClicks > 0 && already >= maxClicks) {
    return { clicked: false, clickedElement: null, reason: 'max_clicks_reached' };
  }

  let candidate: Element | null = null;
  if (params.companionSelector?.trim()) {
    candidate = resolveCustomAreaElement(params.doc, params.companionSelector, 'css');
  }
  if (!candidate && params.matchedElements[0]) {
    candidate = findClickableTarget(params.matchedElements[0]);
  }
  if (!candidate) {
    return { clicked: false, clickedElement: null, reason: 'no_target_found' };
  }

  const delay = Math.max(0, params.delayMs ?? 0);
  if (delay > 0) {
    await new Promise((r) => setTimeout(r, delay));
  }

  const clicked = dispatchRealisticClick(candidate);
  return {
    clicked,
    clickedElement: clicked ? candidate : null,
    reason: clicked ? undefined : 'target_disabled',
  };
}

/**
 * Wait for a CSS/XPath element (optionally matching textFilter) up to timeoutMs.
 */
export async function waitForTargetElement(params: {
  doc: Document;
  selector: string;
  selectorType?: 'css' | 'xpath';
  textFilter?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<Element | null> {
  const timeout = Math.max(0, params.timeoutMs ?? 2000);
  const poll = Math.max(20, params.pollIntervalMs ?? 50);
  const deadline = Date.now() + timeout;

  const lookup = (): Element | null => {
    const clean = params.selector.trim();
    if (!clean) return null;
    let elements: Element[] = [];
    if (params.selectorType === 'xpath' || /^xpath:/i.test(clean)) {
      elements = queryXPathElements(params.doc, clean.replace(/^xpath:/i, '').trim());
    } else {
      try {
        elements = Array.from(params.doc.querySelectorAll(clean));
      } catch {
        return null;
      }
    }
    if (params.textFilter?.trim()) {
      const needle = params.textFilter.trim().toLowerCase();
      elements = elements.filter((el) =>
        (el.textContent || '').toLowerCase().includes(needle),
      );
    }
    return elements[0] ?? null;
  };

  const immediate = lookup();
  if (immediate || timeout === 0) return immediate;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, poll));
    const found = lookup();
    if (found) return found;
  }

  return lookup();
}

/**
 * Feature: Auto Click Targets
 * Executes an ordered array of AutoClickTargets with delay, selector wait, text filter, and retry support.
 */
export async function executeAutoClickTargets(
  doc: Document,
  targets: AutoClickTarget[],
): Promise<Array<{ targetId: string; clicked: boolean; attempts: number }>> {
  const results: Array<{ targetId: string; clicked: boolean; attempts: number }> = [];

  for (const target of targets) {
    if (!target.enabled || !target.selector.trim()) continue;

    if (target.delayMs > 0) {
      await new Promise((r) => setTimeout(r, target.delayMs));
    }

    const maxAttempts = Math.max(1, (target.maxRetries ?? 0) + 1);
    let clicked = false;
    let attempts = 0;

    while (attempts < maxAttempts && !clicked) {
      attempts++;
      const el = await waitForTargetElement({
        doc,
        selector: target.selector,
        selectorType: target.selectorType,
        textFilter: target.textFilter,
        timeoutMs: target.waitTimeoutMs,
      });
      if (el) {
        clicked = dispatchRealisticClick(el);
      }
    }

    results.push({ targetId: target.id, clicked, attempts });
  }

  return results;
}
