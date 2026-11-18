import { resolveCustomAreaElement } from './dom-actions';
import {
  compareNumericThreshold,
  evaluateKeywordRules,
  extractFirstNumber,
} from './expression-engine';
import { addCacheBusterIfNeeded, EXTENSION_UI_ATTR } from './page-guards';
import type {
  ChangeDetectionMethod,
  MonitorEvaluationResult,
  PageMonitorConfig,
} from './types';
import { detectCaptchaInDocument, detectErrorPage } from './url-automation';
import { fnv1aHash } from './utils';

/**
 * Clone a container and strip PulseRefresh UI/highlight artifacts + script/style tags
 * so our own overlays never trigger false-positive change detections.
 */
function buildCleanClone(root: Element): Element {
  const clone = root.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      `script, style, noscript, [${EXTENSION_UI_ATTR}], pulserefresh-timer`,
    )
    .forEach((n) => n.remove());

  // Unwrap <mark data-pulserefresh-highlight> while keeping inner text intact
  clone.querySelectorAll('mark[data-pulserefresh-highlight]').forEach((mark) => {
    const textNode = mark.ownerDocument.createTextNode(mark.textContent || '');
    mark.replaceWith(textNode);
  });

  return clone;
}

/**
 * Feature: Change Detection Method
 * Extracts a deterministic content snapshot according to 'text' | 'html' | 'dom_hash' | 'visual_attribute'.
 */
export function captureContentSnapshot(
  root: Element,
  method: ChangeDetectionMethod,
  options: { ignoreWhitespace?: boolean; ignoreNumbers?: boolean } = {},
): { snapshot: string; hash: string; readableText: string } {
  const clean = buildCleanClone(root);
  let readableText = clean.textContent || '';
  if (options.ignoreWhitespace !== false) {
    readableText = readableText.replace(/\s+/g, ' ').trim();
  }

  let raw: string;
  switch (method) {
    case 'text':
      raw = readableText;
      break;
    case 'html':
      raw = clean.innerHTML;
      if (options.ignoreWhitespace !== false) {
        raw = raw.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
      }
      break;
    case 'dom_hash': {
      // Combines structural tag skeleton + text content into a compact fingerprint
      const tags = Array.from(clean.querySelectorAll('*'))
        .slice(0, 500)
        .map((el) => el.tagName)
        .join(',');
      raw = `${tags}|${readableText}`;
      break;
    }
    case 'visual_attribute': {
      // Tracks interactive/visual state: class, disabled, aria-*, hidden, href, src, value + text
      const attrs = Array.from(clean.querySelectorAll('*'))
        .slice(0, 400)
        .map((el) => {
          const picked = [
            'class',
            'disabled',
            'hidden',
            'aria-disabled',
            'aria-label',
            'data-status',
            'data-stock',
            'href',
            'src',
            'style',
          ]
            .filter((name) => el.hasAttribute(name))
            .map((name) => `${name}=${el.getAttribute(name)}`)
            .join(';');
          return `${el.tagName}[${picked}]`;
        })
        .join('|');
      raw = `${attrs}||${readableText}`;
      break;
    }
    default:
      raw = readableText;
  }

  if (options.ignoreNumbers) {
    raw = raw.replace(/\d+/g, '#');
  }

  const hash = fnv1aHash(raw);
  // Keep stored snapshot bounded (max 16KB)
  const boundedSnapshot =
    method === 'dom_hash' ? hash : raw.slice(0, 16_384);

  return {
    snapshot: boundedSnapshot,
    hash,
    readableText,
  };
}

/**
 * Compute a concise human-readable before/after diff summary between two strings.
 */
export function computeTextDiffSnippet(
  previous: string,
  current: string,
  maxLen = 140,
): string {
  if (previous === current) return '';
  let prefix = 0;
  const minLen = Math.min(previous.length, current.length);
  while (prefix < minLen && previous[prefix] === current[prefix]) {
    prefix++;
  }

  const start = Math.max(0, prefix - 20);
  const oldSlice = previous
    .slice(start, prefix + 60)
    .replace(/\s+/g, ' ')
    .trim();
  const newSlice = current
    .slice(start, prefix + 60)
    .replace(/\s+/g, ' ')
    .trim();

  const summary = `Changed "${oldSlice.slice(0, 55)}" -> "${newSlice.slice(0, 55)}"`;
  return summary.slice(0, maxLen);
}

/**
 * Feature: Monitoring Modes + Change Detection Method + Custom Area
 * Evaluates a DOM document/container against PageMonitorConfig and previous snapshot state.
 */
export function evaluatePageMonitor(params: {
  doc: Document;
  config: PageMonitorConfig;
  previousSnapshot: string | null;
  previousHash: string | null;
  previousNumber?: number | null;
}): MonitorEvaluationResult {
  const { doc, config, previousSnapshot, previousHash, previousNumber } = params;

  const targetRoot =
    (config.customAreaEnabled && config.customAreaSelector
      ? resolveCustomAreaElement(
          doc,
          config.customAreaSelector,
          config.customAreaSelectorType,
        )
      : null) ??
    doc.body ??
    doc.documentElement;

  const { snapshot, hash, readableText } = captureContentSnapshot(
    targetRoot,
    config.changeDetectionMethod,
    {
      ignoreWhitespace: config.ignoreWhitespaceInDiff,
      ignoreNumbers: config.ignoreNumbersInDiff,
    },
  );

  if (!config.enabled) {
    return {
      triggered: false,
      matchedKeywords: [],
      snippet: '',
      snapshot,
      snapshotHash: hash,
      matchCount: 0,
    };
  }

  switch (config.mode) {
    case 'keyword_found': {
      const kw = evaluateKeywordRules(
        config.keywords,
        readableText,
        config.matchLogic,
        { root: targetRoot, baselineNumber: previousNumber },
      );
      return {
        triggered: kw.matched,
        reason: kw.matched ? 'keyword_found' : undefined,
        matchedKeywords: kw.matchedKeywords,
        snippet: kw.snippet,
        snapshot,
        snapshotHash: hash,
        extractedNumber: kw.extractedNumber,
        matchCount: kw.totalMatchCount,
      };
    }

    case 'keyword_lost': {
      const activeKeywords = config.keywords.filter(
        (k) => k.enabled && k.expression.trim().length > 0,
      );
      if (activeKeywords.length === 0) {
        return {
          triggered: false,
          matchedKeywords: [],
          snippet: '',
          snapshot,
          snapshotHash: hash,
          matchCount: 0,
        };
      }
      const kw = evaluateKeywordRules(
        activeKeywords,
        readableText,
        config.matchLogic,
        { root: targetRoot, baselineNumber: previousNumber },
      );
      const disappeared = !kw.matched;
      const missingLabels = activeKeywords.map((k) => k.label || k.expression);
      return {
        triggered: disappeared,
        reason: disappeared ? 'keyword_lost' : undefined,
        matchedKeywords: disappeared ? missingLabels : [],
        snippet: disappeared
          ? `Keyword disappeared: ${missingLabels.join(', ')}`
          : '',
        snapshot,
        snapshotHash: hash,
        matchCount: disappeared ? missingLabels.length : 0,
      };
    }

    case 'any_change': {
      // First scan establishes baseline without firing a false alarm
      if (!previousHash) {
        return {
          triggered: false,
          matchedKeywords: [],
          snippet: 'Baseline snapshot captured',
          snapshot,
          snapshotHash: hash,
          matchCount: 0,
        };
      }
      const changed = hash !== previousHash;
      const diff =
        changed && previousSnapshot && config.changeDetectionMethod !== 'dom_hash'
          ? computeTextDiffSnippet(previousSnapshot, snapshot)
          : changed
            ? `DOM fingerprint changed (${previousHash} -> ${hash})`
            : '';
      return {
        triggered: changed,
        reason: changed ? 'content_changed' : undefined,
        matchedKeywords: changed ? ['Page Content Changed'] : [],
        snippet: diff,
        diffSummary: diff,
        snapshot,
        snapshotHash: hash,
        matchCount: changed ? 1 : 0,
      };
    }

    case 'numeric_threshold': {
      const currentNum = extractFirstNumber(readableText);
      const baseline =
        config.numericThreshold.baselineValue ?? previousNumber ?? currentNum;
      if (currentNum == null) {
        return {
          triggered: false,
          matchedKeywords: [],
          snippet: 'No numeric value found in monitored region',
          snapshot,
          snapshotHash: hash,
          extractedNumber: null,
          matchCount: 0,
        };
      }
      const hit = compareNumericThreshold({
        current: currentNum,
        operator: config.numericThreshold.operator,
        target: config.numericThreshold.value,
        baseline,
      });
      const label = `${currentNum} (${config.numericThreshold.operator} ${config.numericThreshold.value})`;
      return {
        triggered: hit,
        reason: hit ? 'numeric_threshold' : undefined,
        matchedKeywords: hit ? [label] : [],
        snippet: hit ? `Value reached ${label}` : '',
        snapshot,
        snapshotHash: hash,
        extractedNumber: currentNum,
        matchCount: hit ? 1 : 0,
      };
    }

    default:
      return {
        triggered: false,
        matchedKeywords: [],
        snippet: '',
        snapshot,
        snapshotHash: hash,
        matchCount: 0,
      };
  }
}

/**
 * Feature: Continue Refreshing on Keyword Detection (with alert cooldown support)
 */
export function shouldFireDetectionAlert(params: {
  lastAlertAt: number | null;
  cooldownSeconds: number;
  continueOnDetection: boolean;
  now?: number;
}): boolean {
  const now = params.now ?? Date.now();
  if (!params.continueOnDetection) return true;
  if (!params.lastAlertAt) return true;
  if (params.cooldownSeconds <= 0) return true;
  return now - params.lastAlertAt >= params.cooldownSeconds * 1000;
}

/**
 * Feature: Refresh Types — XHR Refresh (background fetch + flicker-free selective DOM swap)
 */
export interface XhrRefreshOutcome {
  ok: boolean;
  httpStatus: number;
  updatedSelector: string;
  shouldFallbackToFull: boolean;
  captcha: ReturnType<typeof detectCaptchaInDocument>;
  errorPage: ReturnType<typeof detectErrorPage>;
  errorMessage?: string;
}

export async function performXhrRefresh(params: {
  url: string;
  doc?: Document;
  win?: Window;
  hardRefresh?: boolean;
  customAreaEnabled?: boolean;
  customAreaSelector?: string;
  customAreaSelectorType?: 'css' | 'xpath';
  xhrFallbackToFull?: boolean;
  monitoredErrorCodes?: number[];
  fetcher?: typeof fetch;
}): Promise<XhrRefreshOutcome> {
  const doc = params.doc ?? document;
  const win = params.win ?? window;
  const fetchFn = params.fetcher ?? globalThis.fetch;
  const fetchUrl = addCacheBusterIfNeeded(params.url, Boolean(params.hardRefresh));

  try {
    const response = await fetchFn(fetchUrl, {
      method: 'GET',
      credentials: 'include',
      cache: params.hardRefresh ? 'no-store' : 'no-cache',
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
        ...(params.hardRefresh
          ? { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' }
          : {}),
      },
    });

    const html = await response.text();
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(html, 'text/html');

    const captcha = detectCaptchaInDocument(parsedDoc);
    const errorPage = detectErrorPage({
      doc: parsedDoc,
      url: response.url || params.url,
      httpStatus: response.status,
      monitoredCodes: params.monitoredErrorCodes,
    });

    if (!response.ok || errorPage.detected || captcha.detected) {
      return {
        ok: false,
        httpStatus: response.status,
        updatedSelector: '',
        shouldFallbackToFull: false,
        captcha,
        errorPage,
        errorMessage: errorPage.reason || captcha.provider || `HTTP ${response.status}`,
      };
    }

    // Preserve user scroll position and extension UI hosts during DOM patch
    const scrollX = win.scrollX ?? 0;
    const scrollY = win.scrollY ?? 0;
    let updatedSelector = 'body';

    if (params.customAreaEnabled && params.customAreaSelector) {
      const selectorType = params.customAreaSelectorType ?? 'css';
      const currentEl = resolveCustomAreaElement(
        doc,
        params.customAreaSelector,
        selectorType,
      );
      const freshEl = resolveCustomAreaElement(
        parsedDoc,
        params.customAreaSelector,
        selectorType,
      );
      if (currentEl && freshEl) {
        currentEl.innerHTML = freshEl.innerHTML;
        updatedSelector = params.customAreaSelector;
      } else if (parsedDoc.body && doc.body) {
        swapBodyPreservingExtensionUi(doc, parsedDoc);
      }
    } else if (parsedDoc.body && doc.body) {
      swapBodyPreservingExtensionUi(doc, parsedDoc);
    }

    if (parsedDoc.title) {
      doc.title = parsedDoc.title;
    }

    try {
      win.scrollTo(scrollX, scrollY);
    } catch {
      // jsdom does not implement scrollTo unless mocked
    }

    return {
      ok: true,
      httpStatus: response.status,
      updatedSelector,
      shouldFallbackToFull: false,
      captcha: { detected: false },
      errorPage: { detected: false },
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      updatedSelector: '',
      shouldFallbackToFull: params.xhrFallbackToFull !== false,
      captcha: { detected: false },
      errorPage: { detected: false },
      errorMessage: err instanceof Error ? err.message : 'XHR fetch failed',
    };
  }
}

function swapBodyPreservingExtensionUi(
  liveDoc: Document,
  freshDoc: Document,
): void {
  const preserved = Array.from(
    liveDoc.body.querySelectorAll(`[${EXTENSION_UI_ATTR}], pulserefresh-timer`),
  );
  liveDoc.body.innerHTML = freshDoc.body.innerHTML;
  for (const el of preserved) {
    liveDoc.body.appendChild(el);
  }
}

/**
 * Feature: Real-Time Detection During Refresh
 * Attaches a debounced MutationObserver to catch live SPA/WebSocket/AJAX updates
 * mid-cycle, ignoring mutations made by PulseRefresh highlights and visual timer.
 */
export function attachRealTimeMonitor(params: {
  root: Element;
  debounceMs?: number;
  onMutate: () => void;
}): () => void {
  const debounceMs = Math.max(25, params.debounceMs ?? 250);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const isExtensionNode = (node: Node): boolean => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as Element;
    return (
      el.hasAttribute(EXTENSION_UI_ATTR) ||
      el.hasAttribute('data-pulserefresh-highlight') ||
      el.tagName?.toLowerCase() === 'pulserefresh-timer' ||
      Boolean(el.closest?.(`[${EXTENSION_UI_ATTR}]`))
    );
  };

  const observer = new MutationObserver((mutations) => {
    if (disposed) return;
    const meaningful = mutations.some((m) => {
      if (isExtensionNode(m.target)) return false;
      if (m.type === 'characterData' || m.type === 'attributes') return true;
      const changedNodes = [
        ...Array.from(m.addedNodes),
        ...Array.from(m.removedNodes),
      ];
      return changedNodes.some((n) => !isExtensionNode(n));
    });
    if (!meaningful) return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!disposed) params.onMutate();
    }, debounceMs);
  });

  observer.observe(params.root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'disabled', 'hidden', 'data-status', 'data-stock', 'aria-disabled'],
  });

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}

/**
 * Feature: Run Detection After Load
 * Waits until document.readyState === 'complete', then waits postLoadDelayMs
 * (allowing SPA hydration/lazy chunks to settle) before invoking callback.
 */
export function runDetectionAfterLoad<T>(params: {
  doc?: Document;
  win?: Window;
  postLoadDelayMs?: number;
  maxLoadWaitMs?: number;
  task: () => T | Promise<T>;
}): Promise<T> {
  const doc = params.doc ?? document;
  const win = params.win ?? window;
  const settleMs = Math.max(0, params.postLoadDelayMs ?? 0);
  const maxWaitMs = Math.max(100, params.maxLoadWaitMs ?? 10_000);

  return new Promise<T>((resolve, reject) => {
    let executed = false;

    const trigger = () => {
      if (executed) return;
      executed = true;
      setTimeout(() => {
        Promise.resolve()
          .then(() => params.task())
          .then(resolve, reject);
      }, settleMs);
    };

    if (doc.readyState === 'complete') {
      trigger();
      return;
    }

    const onLoad = () => {
      win.removeEventListener('load', onLoad);
      clearTimeout(fallbackTimer);
      trigger();
    };

    const fallbackTimer = setTimeout(() => {
      win.removeEventListener('load', onLoad);
      trigger();
    }, maxWaitMs);

    win.addEventListener('load', onLoad, { once: true });
  });
}
