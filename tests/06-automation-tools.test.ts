import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  captureCookieSnapshot,
  compilePromptOffline,
  createCustomUserScript,
  executeAutomationMacro,
  executeCookieAutomationRules,
  executeMatchingScripts,
  findHotkeyConflicts,
  generateAiAutomation,
  matchHotkeyEvent,
  restoreCookieSnapshot,
  startMacroRecorder,
} from '@/src/lib/automation';
import { handleHotkeyCommand } from '@/src/lib/background-controller';
import { setBrowserOverride } from '@/src/lib/browser-api';
import { DEFAULT_HOTKEYS, MARKETPLACE_SCRIPTS } from '@/src/lib/defaults';
import { executeAutoClickTargets } from '@/src/lib/dom-actions';
import { getTabJob } from '@/src/lib/storage';

describe('Category 6 — Automation Tools', () => {
  describe('6.1 Execute Custom Scripts & AI Automation (Marketplace + Custom + AI)', () => {
    it('executes both Marketplace scripts and user-authored Custom Scripts on matching URLs & timings', async () => {
      document.body.innerHTML = `
        <div class="popup-backdrop">Promo Modal</div>
        <button id="onetrust-accept-btn-handler">Accept Cookies</button>
        <input id="coupon" value="" />
      `;
      const cookieClick = vi.fn();
      document
        .getElementById('onetrust-accept-btn-handler')!
        .addEventListener('click', cookieClick);

      const enabledMarketplace = MARKETPLACE_SCRIPTS.filter((s) =>
        ['mkt_dismiss_cookies', 'mkt_remove_popups'].includes(s.id),
      ).map((s) => ({ ...s, enabled: true }));

      const customScript = createCustomUserScript({
        name: 'Inject VIP Coupon',
        urlPattern: 'https://shop.example.com/*',
        timing: 'after_load',
        code: `document.getElementById('coupon').value = 'VIP50';`,
        actions: [{ type: 'fill_input', selector: '#coupon', value: 'VIP50' }],
      });

      const results = await executeMatchingScripts({
        scripts: [...enabledMarketplace, customScript],
        url: 'https://shop.example.com/cart',
        timing: 'after_load',
        doc: document,
        win: window,
      });

      expect(results).toHaveLength(3);
      expect(cookieClick).toHaveBeenCalledTimes(1);
      expect(document.querySelector('.popup-backdrop')).toBeNull();
      expect((document.getElementById('coupon') as HTMLInputElement).value).toBe('VIP50');
    });

    it('compiles natural-language prompts via offline smart parser AND via BYO OpenAI-compatible API', async () => {
      const offline = compilePromptOffline(
        'Click #buy-now then fill "SAVE25" into #promo then wait 500ms then check #terms',
      );
      expect(offline.usedAiApi).toBe(false);
      expect(offline.macro.steps.map((s) => s.type)).toEqual([
        'click',
        'fill',
        'wait',
        'check',
      ]);
      expect(offline.script.source).toBe('ai');

      // Test BYO OpenAI-compatible endpoint integration
      const mockAiFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    name: 'Smart Reserve Bot',
                    description: 'Clicks reserve and submits',
                    code: `document.querySelector('#reserve')?.click();`,
                    actions: [{ type: 'click_selector', selector: '#reserve' }],
                    steps: [
                      { type: 'click', selector: '#reserve', label: 'Click reserve' },
                      { type: 'click', selector: '#submit', label: 'Submit' },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const online = await generateAiAutomation({
        prompt: 'Reserve slot and submit form',
        aiConfig: {
          providerName: 'OpenAI',
          endpointUrl: 'https://api.openai.com/v1/chat/completions',
          apiKey: 'sk-test-key',
          model: 'gpt-4o-mini',
        },
        fetcher: mockAiFetch as unknown as typeof fetch,
      });
      expect(online.usedAiApi).toBe(true);
      expect(online.script.name).toBe('Smart Reserve Bot');
      expect(online.macro.steps).toHaveLength(2);
    });
  });

  describe('6.2 Hotkeys (Keyboard Shortcuts)', () => {
    it('matches keyboard shortcut events, detects duplicate bindings, and toggles tab refresh via command handler', async () => {
      const evt = new KeyboardEvent('keydown', {
        key: 'R',
        code: 'KeyR',
        altKey: true,
        shiftKey: true,
      });
      expect(matchHotkeyEvent(evt, DEFAULT_HOTKEYS)).toBe('toggle-refresh');

      // Detect duplicate conflict
      const conflicted = DEFAULT_HOTKEYS.map((h, idx) =>
        idx < 2 ? { ...h, combo: 'Alt+Shift+R' } : h,
      );
      expect(findHotkeyConflicts(conflicted)).toHaveLength(1);

      // Command handler starts then stops refresh on tab 88
      const r1 = await handleHotkeyCommand('toggle-refresh', 88);
      expect(r1).toEqual({ handled: true, action: 'started' });
      expect((await getTabJob(88))?.status).toBe('running');

      const r2 = await handleHotkeyCommand('toggle-refresh', 88);
      expect(r2).toEqual({ handled: true, action: 'stopped' });
      expect((await getTabJob(88))?.status).toBe('stopped');
    });
  });

  describe('6.3 Auto Click Targets', () => {
    it('clicks ordered targets with text filtering and waits for asynchronously rendered elements', async () => {
      document.body.innerHTML = `
        <button class="tab">Overview</button>
        <button class="tab" id="live-tab">Live Inventory</button>
      `;

      const clickedOrder: string[] = [];
      document
        .getElementById('live-tab')!
        .addEventListener('click', () => clickedOrder.push('live-tab'));

      // Mount delayed button 40ms later
      setTimeout(() => {
        const delayed = document.createElement('button');
        delayed.id = 'delayed-refresh';
        delayed.textContent = 'Reload Rows';
        delayed.addEventListener('click', () => clickedOrder.push('delayed-refresh'));
        document.body.appendChild(delayed);
      }, 40);

      const outcomes = await executeAutoClickTargets(document, [
        {
          id: 't1',
          label: 'Switch to Live Tab',
          selector: 'button.tab',
          selectorType: 'css',
          textFilter: 'Live Inventory',
          delayMs: 0,
          waitTimeoutMs: 200,
          maxRetries: 0,
          enabled: true,
        },
        {
          id: 't2',
          label: 'Click Async Button',
          selector: '#delayed-refresh',
          selectorType: 'css',
          delayMs: 10,
          waitTimeoutMs: 400,
          maxRetries: 1,
          enabled: true,
        },
      ]);

      expect(outcomes.every((o) => o.clicked)).toBe(true);
      expect(clickedOrder).toEqual(['live-tab', 'delayed-refresh']);
    });
  });

  describe('6.4 Cookie Automation', () => {
    it('supports clear_all, delete_matching, keep_only allowlist, set_cookie, and Cookie Jar snapshot/restore', async () => {
      // Realistic in-memory cookie jar mock
      let jar = [
        { name: 'session_id', value: 'abc', domain: 'shop.example.com', path: '/', secure: true, httpOnly: true },
        { name: '_ga_track', value: '111', domain: 'shop.example.com', path: '/', secure: true, httpOnly: false },
        { name: 'queue_token', value: 'old', domain: 'shop.example.com', path: '/', secure: true, httpOnly: false },
      ];

      setBrowserOverride({
        ...fakeBrowser,
        cookies: {
          getAll: vi.fn(async () => [...jar]),
          remove: vi.fn(async ({ name }: { url: string; name: string }) => {
            jar = jar.filter((c) => c.name !== name);
            return { name };
          }),
          set: vi.fn(async (details: { name: string; value: string; path?: string; secure?: boolean; httpOnly?: boolean }) => {
            jar = jar.filter((c) => c.name !== details.name);
            jar.push({
              name: details.name,
              value: details.value,
              domain: 'shop.example.com',
              path: details.path || '/',
              secure: Boolean(details.secure),
              httpOnly: Boolean(details.httpOnly),
            });
            return details;
          }),
        },
      } as unknown as typeof fakeBrowser);

      // Snapshot before modifications
      const snap = await captureCookieSnapshot('https://shop.example.com/drop', 'Pre-Drop');
      expect(snap.cookies).toHaveLength(3);

      // Keep only session_id + inject ab_bucket=fast
      const res = await executeCookieAutomationRules({
        url: 'https://shop.example.com/drop',
        timing: 'before_refresh',
        rules: [
          {
            id: 'c1',
            name: 'Preserve Session Only',
            enabled: true,
            domainPattern: 'shop.example.com',
            timing: 'before_refresh',
            action: 'keep_only',
            cookieNames: ['session_id'],
          },
          {
            id: 'c2',
            name: 'Pin Fast Bucket',
            enabled: true,
            domainPattern: '*.example.com',
            timing: 'before_refresh',
            action: 'set_cookie',
            cookieNames: ['ab_bucket'],
            cookieToSet: { name: 'ab_bucket', value: 'fast' },
          },
        ],
      });

      expect(res.removedCount).toBe(2);
      expect(res.setCount).toBe(1);
      expect(jar.map((c) => c.name).sort()).toEqual(['ab_bucket', 'session_id']);

      // Clear all then restore from snapshot
      await executeCookieAutomationRules({
        url: 'https://shop.example.com/drop',
        timing: 'before_refresh',
        rules: [
          {
            id: 'c3',
            name: 'Wipe',
            enabled: true,
            domainPattern: 'shop.example.com',
            timing: 'before_refresh',
            action: 'clear_all',
            cookieNames: [],
          },
        ],
      });
      expect(jar).toHaveLength(0);

      const restored = await restoreCookieSnapshot(snap, 'https://shop.example.com/');
      expect(restored).toBe(3);
      expect(jar).toHaveLength(3);
    });
  });

  describe('6.5 Run Macro After Detection (+ Live Macro Recorder)', () => {
    it('executes multi-step detection macros (fill, select, check, extract_text, click, webhook) and records live user actions', async () => {
      document.body.innerHTML = `
        <form id="checkout">
          <span id="final-price">$149.00</span>
          <input id="email" type="email" value="" />
          <select id="qty"><option value="1">1</option><option value="2">2</option></select>
          <input id="agree" type="checkbox" />
          <button id="submit-order" type="button">Place Order</button>
        </form>
      `;

      let orderSubmitted = false;
      document
        .getElementById('submit-order')!
        .addEventListener('click', () => {
          orderSubmitted = true;
        });

      const webhookMock = vi
        .fn()
        .mockResolvedValue(new Response('{"received":true}', { status: 200 }));

      const report = await executeAutomationMacro({
        doc: document,
        win: window,
        fetcher: webhookMock as unknown as typeof fetch,
        macro: {
          id: 'm_checkout',
          name: 'Auto Checkout Macro',
          description: 'Completes reservation after keyword match',
          enabled: true,
          runOnDetection: true,
          createdAt: Date.now(),
          steps: [
            { id: 's1', type: 'extract_text', selector: '#final-price' },
            { id: 's2', type: 'fill', selector: '#email', value: 'buyer@example.com' },
            { id: 's3', type: 'select', selector: '#qty', value: '2' },
            { id: 's4', type: 'check', selector: '#agree', value: 'true' },
            { id: 's5', type: 'wait', delayMs: 10 },
            { id: 's6', type: 'click', selector: '#submit-order' },
            { id: 's7', type: 'webhook', value: 'https://hooks.example.com/macro-done' },
          ],
        },
      });

      expect(report.ok).toBe(true);
      expect(report.completedSteps).toBe(7);
      expect(report.extractedValues).toEqual(['$149.00']);
      expect((document.getElementById('email') as HTMLInputElement).value).toBe(
        'buyer@example.com',
      );
      expect((document.getElementById('qty') as HTMLSelectElement).value).toBe('2');
      expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(true);
      expect(orderSubmitted).toBe(true);
      expect(webhookMock).toHaveBeenCalledTimes(1);

      // Verify live DOM Macro Recorder captures click & change events
      const recorder = startMacroRecorder(document);
      document
        .getElementById('submit-order')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const emailInput = document.getElementById('email') as HTMLInputElement;
      emailInput.value = 'recorded@example.com';
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      const recordedSteps = recorder.stop();
      expect(recordedSteps.map((s) => s.type)).toEqual(['click', 'fill']);
    });
  });
});
