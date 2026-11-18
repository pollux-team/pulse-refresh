import { describe, expect, it, vi } from 'vitest';
import {
  autoClickOnKeywordMatch,
  clearHighlights,
  generateUniqueCssSelector,
  HIGHLIGHT_ATTR,
  highlightDetectedKeywords,
  resolveCustomAreaElement,
  scrollToDetectedElement,
  startInteractiveElementPicker,
} from '@/src/lib/dom-actions';
import { createDefaultMonitorConfig } from '@/src/lib/defaults';
import { evaluatePageMonitor } from '@/src/lib/monitor-engine';

describe('Category 4 — Advanced Monitoring', () => {
  describe('4.1 Monitor Custom Page Area & Visual Element Picker', () => {
    it('scopes page monitoring strictly to the configured CSS or XPath container', () => {
      document.body.innerHTML = `
        <aside id="recommendations">In Stock (other item)</aside>
        <main id="buy-box"><span class="availability">Sold Out</span></main>
      `;

      expect(resolveCustomAreaElement(document, '#buy-box', 'css')?.id).toBe('buy-box');
      expect(
        resolveCustomAreaElement(document, '//main[@id="buy-box"]', 'xpath')?.id,
      ).toBe('buy-box');

      const cfg = createDefaultMonitorConfig();
      cfg.enabled = true;
      cfg.mode = 'keyword_found';
      cfg.customAreaEnabled = true;
      cfg.customAreaSelector = '#buy-box';
      cfg.keywords = [
        {
          id: 'k1',
          expression: 'In Stock',
          type: 'plain',
          caseSensitive: false,
          wholeWord: false,
          enabled: true,
        },
      ];

      // Should NOT trigger on sidebar's "In Stock"
      const miss = evaluatePageMonitor({
        doc: document,
        config: cfg,
        previousSnapshot: null,
        previousHash: null,
      });
      expect(miss.triggered).toBe(false);

      // Update buy-box -> SHOULD trigger
      document.querySelector('#buy-box .availability')!.textContent = 'In Stock Now!';
      const hit = evaluatePageMonitor({
        doc: document,
        config: cfg,
        previousSnapshot: null,
        previousHash: null,
      });
      expect(hit.triggered).toBe(true);
    });

    it('lets user point-and-click an element with startInteractiveElementPicker and generates unique selector', () => {
      document.body.innerHTML = `
        <div class="grid">
          <div class="card"><span data-testid="live-price">$49.99</span></div>
        </div>
      `;

      const target = document.querySelector('[data-testid="live-price"]')!;
      expect(generateUniqueCssSelector(target)).toBe('span[data-testid="live-price"]');

      const onSelect = vi.fn();
      startInteractiveElementPicker({ doc: document, onSelect });

      target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0]?.[0]).toMatchObject({
        selector: 'span[data-testid="live-price"]',
        previewText: '$49.99',
      });
      // Picker overlay cleaned up automatically after selection
      expect(document.querySelector('[data-pulserefresh-ui="picker-overlay"]')).toBeNull();
    });
  });

  describe('4.2 Highlight Detected Keyword', () => {
    it('wraps all matched keywords in <mark> elements and cleanly restores original DOM on clearHighlights', () => {
      document.body.innerHTML = `<article id="post"><p>Ticket slot Available for Monday and available for Tuesday!</p></article>`;
      const root = document.getElementById('post')!;

      const marks = highlightDetectedKeywords({
        root,
        keywords: ['available'],
        color: '#fde047',
      });

      expect(marks).toHaveLength(2);
      expect(root.querySelectorAll(`mark[${HIGHLIGHT_ATTR}]`)).toHaveLength(2);
      expect(marks[0]?.textContent).toBe('Available');
      expect(marks[1]?.textContent).toBe('available');

      clearHighlights(root);
      expect(root.querySelectorAll(`mark[${HIGHLIGHT_ATTR}]`)).toHaveLength(0);
      expect(root.textContent).toBe(
        'Ticket slot Available for Monday and available for Tuesday!',
      );
    });
  });

  describe('4.3 Scroll to Keyword', () => {
    it('smoothly scrolls detected match into center viewport and supports match index cycling', () => {
      document.body.innerHTML = `<div id="m1">First</div><div id="m2">Second</div>`;
      const el1 = document.getElementById('m1')!;
      const el2 = document.getElementById('m2')!;
      const scrollSpy1 = vi.fn();
      const scrollSpy2 = vi.fn();
      el1.scrollIntoView = scrollSpy1;
      el2.scrollIntoView = scrollSpy2;

      scrollToDetectedElement([el1, el2], 0);
      expect(scrollSpy1).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
      expect(el1.getAttribute('data-pulserefresh-scrolled')).toBe('true');

      scrollToDetectedElement([el1, el2], 1);
      expect(scrollSpy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('4.4 Auto-click on Keyword Match', () => {
    it('clicks nearest clickable button ancestor of highlighted keyword and respects maxAutoClicks cap', async () => {
      document.body.innerHTML = `
        <div id="product">
          <button id="buy-btn"><span>Buy Now — $99</span></button>
        </div>
      `;
      const btn = document.getElementById('buy-btn')!;
      const clickHandler = vi.fn();
      btn.addEventListener('click', clickHandler);

      const marks = highlightDetectedKeywords({
        root: document.getElementById('product')!,
        keywords: ['Buy Now'],
      });

      const first = await autoClickOnKeywordMatch({
        doc: document,
        matchedElements: marks,
        delayMs: 0,
        alreadyClickedCount: 0,
        maxAutoClicks: 1,
      });
      expect(first.clicked).toBe(true);
      expect(first.clickedElement).toBe(btn);
      expect(clickHandler).toHaveBeenCalledTimes(1);

      // Guard prevents runaway repeated auto-clicks when maxAutoClicks reached
      const second = await autoClickOnKeywordMatch({
        doc: document,
        matchedElements: marks,
        alreadyClickedCount: 1,
        maxAutoClicks: 1,
      });
      expect(second.clicked).toBe(false);
      expect(second.reason).toBe('max_clicks_reached');
    });
  });
});
