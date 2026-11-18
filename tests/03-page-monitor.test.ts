import { describe, expect, it, vi } from 'vitest';
import {
  handlePageScanReport,
  startTabJob,
} from '@/src/lib/background-controller';
import {
  BUILTIN_KEYWORD_TEMPLATES,
  createDefaultMonitorConfig,
} from '@/src/lib/defaults';
import {
  createCustomKeywordTemplate,
  evaluateBooleanExpression,
  evaluateKeywordRules,
  instantiateKeywordTemplate,
  validateExpression,
} from '@/src/lib/expression-engine';
import {
  attachRealTimeMonitor,
  captureContentSnapshot,
  evaluatePageMonitor,
  performXhrRefresh,
  runDetectionAfterLoad,
  shouldFireDetectionAlert,
} from '@/src/lib/monitor-engine';

describe('Category 3 — Page Monitor', () => {
  describe('3.1 Refresh Types (Full Page & XHR Refresh)', () => {
    it('performs flicker-free XHR refresh, patches custom area DOM, preserves extension UI, and signals fallback on network failure', async () => {
      document.body.innerHTML = `
        <header id="nav">Static Nav</header>
        <section id="stock">Sold Out</section>
        <div data-pulserefresh-ui="timer">00:09</div>
      `;

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          `<html><head><title>Updated Store</title></head><body><header id="nav">Changed Nav</header><section id="stock">In Stock — 4 left!</section></body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        ),
      );

      const outcome = await performXhrRefresh({
        url: 'https://store.example.com/gpu',
        doc: document,
        win: window,
        hardRefresh: true,
        customAreaEnabled: true,
        customAreaSelector: '#stock',
        fetcher: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.updatedSelector).toBe('#stock');
      expect(document.querySelector('#stock')?.textContent).toBe('In Stock — 4 left!');
      expect(document.querySelector('#nav')?.textContent).toBe('Static Nav');
      expect(document.querySelector('[data-pulserefresh-ui="timer"]')).not.toBeNull();
      expect(document.title).toBe('Updated Store');

      // Verify network failure signals fallback to Full Page Reload
      const failed = await performXhrRefresh({
        url: 'https://store.example.com/gpu',
        doc: document,
        win: window,
        xhrFallbackToFull: true,
        fetcher: vi.fn().mockRejectedValue(new Error('CORS blocked')) as unknown as typeof fetch,
      });
      expect(failed.ok).toBe(false);
      expect(failed.shouldFallbackToFull).toBe(true);
    });
  });

  describe('3.2 Monitoring Modes (keyword_found, keyword_lost, any_change, numeric_threshold)', () => {
    const parser = new DOMParser();

    it('detects keyword_found and keyword_lost accurately', () => {
      const cfg = createDefaultMonitorConfig();
      cfg.enabled = true;
      cfg.mode = 'keyword_found';
      cfg.keywords = [
        {
          id: 'k1',
          expression: 'Add to Cart',
          type: 'plain',
          caseSensitive: false,
          wholeWord: false,
          enabled: true,
        },
      ];

      const docWithBtn = parser.parseFromString(
        `<html><body><button>Add to Cart</button></body></html>`,
        'text/html',
      );
      const found = evaluatePageMonitor({
        doc: docWithBtn,
        config: cfg,
        previousSnapshot: null,
        previousHash: null,
      });
      expect(found.triggered).toBe(true);
      expect(found.reason).toBe('keyword_found');

      // keyword_lost alerts when "Out of Stock" disappears
      cfg.mode = 'keyword_lost';
      cfg.keywords[0]!.expression = 'Out of Stock';
      const lost = evaluatePageMonitor({
        doc: docWithBtn,
        config: cfg,
        previousSnapshot: null,
        previousHash: null,
      });
      expect(lost.triggered).toBe(true);
      expect(lost.reason).toBe('keyword_lost');
    });

    it('detects any_change after baseline capture and numeric_threshold price drops', () => {
      const cfg = createDefaultMonitorConfig();
      cfg.enabled = true;
      cfg.mode = 'any_change';

      const doc1 = parser.parseFromString(`<p>Version 1.0</p>`, 'text/html');
      const doc2 = parser.parseFromString(`<p>Version 2.0 Released!</p>`, 'text/html');

      const baseline = evaluatePageMonitor({
        doc: doc1,
        config: cfg,
        previousSnapshot: null,
        previousHash: null,
      });
      expect(baseline.triggered).toBe(false);

      const diff = evaluatePageMonitor({
        doc: doc2,
        config: cfg,
        previousSnapshot: baseline.snapshot,
        previousHash: baseline.snapshotHash,
      });
      expect(diff.triggered).toBe(true);
      expect(diff.reason).toBe('content_changed');
      expect(diff.snippet).toContain('Changed');

      // numeric_threshold mode
      cfg.mode = 'numeric_threshold';
      cfg.numericThreshold = { operator: '<', value: 250, baselineValue: null };
      const priceDoc = parser.parseFromString(
        `<div>Deal Price: $199.95</div>`,
        'text/html',
      );
      const numHit = evaluatePageMonitor({
        doc: priceDoc,
        config: cfg,
        previousSnapshot: null,
        previousHash: null,
      });
      expect(numHit.triggered).toBe(true);
      expect(numHit.extractedNumber).toBeCloseTo(199.95);
    });
  });

  describe('3.3 Change Detection Method (text, html, dom_hash, visual_attribute)', () => {
    it('detects attribute/disabled mutations in visual_attribute mode and ignores numbers when configured', () => {
      const div = document.createElement('div');
      div.innerHTML = `<button disabled class="btn">Reserve</button>`;
      const snap1 = captureContentSnapshot(div, 'visual_attribute');

      div.innerHTML = `<button class="btn ready">Reserve</button>`;
      const snap2 = captureContentSnapshot(div, 'visual_attribute');
      const text1 = captureContentSnapshot(div, 'text');
      expect(snap1.hash).not.toBe(snap2.hash);
      expect(text1.snapshot).toBe('Reserve');

      // ignoreNumbers option keeps dynamic counters from triggering false alerts
      const counterA = document.createElement('div');
      counterA.textContent = 'Updated 5 seconds ago';
      const counterB = document.createElement('div');
      counterB.textContent = 'Updated 42 seconds ago';
      expect(
        captureContentSnapshot(counterA, 'dom_hash', { ignoreNumbers: true }).hash,
      ).toBe(
        captureContentSnapshot(counterB, 'dom_hash', { ignoreNumbers: true }).hash,
      );
    });
  });

  describe('3.4 Predefined Target Keywords & 3.6 Supported Expressions', () => {
    it('supports plain (case + whole-word), wildcard, regex, boolean, CSS, XPath, numeric, and ANY/ALL logic', () => {
      document.body.innerHTML = `
        <div id="listing">
          <h2>RTX 5080 Founders Edition — $899.00</h2>
          <p class="status">Status: In Warehouse Stock (12 slots available)</p>
          <button class="buy-cta" data-ready="yes">Buy Now</button>
        </div>
      `;
      const text = document.body.textContent || '';

      const allRules = evaluateKeywordRules(
        [
          { id: '1', expression: 'Founders', type: 'plain', caseSensitive: true, wholeWord: true, enabled: true },
          { id: '2', expression: 'In * Stock', type: 'wildcard', caseSensitive: false, wholeWord: false, enabled: true },
          { id: '3', expression: '/\\d+\\s+slots\\s+available/i', type: 'regex', caseSensitive: false, wholeWord: false, enabled: true },
          { id: '4', expression: '("Buy Now" OR "Add to Cart") AND NOT "Sold Out"', type: 'boolean', caseSensitive: false, wholeWord: false, enabled: true },
          { id: '5', expression: 'button.buy-cta:not([disabled])', type: 'css', caseSensitive: false, wholeWord: false, enabled: true },
          { id: '6', expression: '//button[@data-ready="yes"]', type: 'xpath', caseSensitive: false, wholeWord: false, enabled: true },
          { id: '7', expression: '< 1000', type: 'numeric', caseSensitive: false, wholeWord: false, enabled: true },
        ],
        text,
        'all',
        { root: document },
      );

      expect(allRules.matched).toBe(true);
      expect(allRules.matchedRules).toHaveLength(7);

      // Verify boolean NOT rejection
      expect(
        evaluateBooleanExpression(
          '("In Stock" OR "Buy Now") AND NOT "Pre-order"',
          'In Stock — Pre-order only',
        ).matched,
      ).toBe(false);

      // Verify invalid regex validation catches syntax error safely
      expect(validateExpression('/[unclosed/', 'regex').valid).toBe(false);
    });
  });

  describe('3.5 Define Keyword Template', () => {
    it('interpolates {{variable}} placeholders in built-in and custom keyword templates', () => {
      const restockTpl = BUILTIN_KEYWORD_TEMPLATES.find(
        (t) => t.id === 'tpl_ecommerce_restock',
      )!;
      const rules = instantiateKeywordTemplate(restockTpl, { product: 'PS5 Pro' });
      expect(rules.some((r) => r.expression === 'PS5 Pro * available' && r.enabled)).toBe(
        true,
      );

      const custom = createCustomKeywordTemplate({
        name: 'Flight Fare Alert',
        mode: 'keyword_found',
        rules: [
          {
            expression: '{{origin}} to {{dest}}',
            type: 'plain',
            caseSensitive: false,
            wholeWord: false,
            enabled: true,
          },
        ],
      });
      expect(custom.variables).toEqual(['origin', 'dest']);
      const bound = instantiateKeywordTemplate(custom, {
        origin: 'DAC',
        dest: 'SIN',
      });
      expect(bound[0]?.expression).toBe('DAC to SIN');
    });
  });

  describe('3.7 Continue Refreshing on Keyword Detection', () => {
    it('keeps job running after detection and respects alert cooldown', async () => {
      expect(
        shouldFireDetectionAlert({
          lastAlertAt: 10_000,
          cooldownSeconds: 30,
          continueOnDetection: true,
          now: 25_000,
        }),
      ).toBe(false);
      expect(
        shouldFireDetectionAlert({
          lastAlertAt: 10_000,
          cooldownSeconds: 30,
          continueOnDetection: true,
          now: 45_000,
        }),
      ).toBe(true);

      await startTabJob(
        {
          tabId: 50,
          url: 'https://news.example.com',
          overrides: {
            monitor: {
              enabled: true,
              continueOnDetection: true,
              alertCooldownSeconds: 60,
            },
          },
        },
        { enablePrecisionTimer: false },
      );

      const after = await handlePageScanReport(
        50,
        {
          type: 'PAGE_SCAN_REPORT',
          url: 'https://news.example.com',
          title: 'News',
          source: 'after_load',
          monitorResult: {
            triggered: true,
            reason: 'keyword_found',
            matchedKeywords: ['Breaking'],
            snippet: 'Breaking update',
            snapshot: 'Breaking update',
            snapshotHash: 'abcd1234',
            matchCount: 1,
          },
        },
        { enablePrecisionTimer: false },
      );
      expect(after?.status).toBe('running');
      expect(after?.detectionCount).toBe(1);
      expect(after?.nextRefreshAt).not.toBeNull();
    });
  });

  describe('3.8 Real-Time Detection During Refresh & 3.9 Run Detection After Load', () => {
    it('fires debounced MutationObserver callback on real DOM updates while ignoring extension nodes', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const onMutate = vi.fn();

      const stop = attachRealTimeMonitor({
        root: container,
        debounceMs: 30,
        onMutate,
      });

      // Extension highlight mutation should be ignored
      const extNode = document.createElement('div');
      extNode.setAttribute('data-pulserefresh-ui', 'badge');
      container.appendChild(extNode);
      await new Promise((r) => setTimeout(r, 60));
      expect(onMutate).not.toHaveBeenCalled();

      // Genuine live page content update fires callback
      const stockBadge = document.createElement('span');
      stockBadge.textContent = 'Back in Stock!';
      container.appendChild(stockBadge);
      await new Promise((r) => setTimeout(r, 70));
      expect(onMutate).toHaveBeenCalledTimes(1);
      stop();
    });

    it('runs detection after document load + configured post-load settle delay', async () => {
      const t0 = Date.now();
      const result = await runDetectionAfterLoad({
        doc: document,
        win: window,
        postLoadDelayMs: 40,
        task: () => 'scanned-after-hydration',
      });
      expect(result).toBe('scanned-after-hydration');
      expect(Date.now() - t0).toBeGreaterThanOrEqual(30);
    });
  });
});
