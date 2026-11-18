import { getBrowser } from './browser-api';
import {
  dispatchRealisticClick,
  generateUniqueCssSelector,
  waitForTargetElement,
} from './dom-actions';
import { EXTENSION_UI_ATTR } from './page-guards';
import type {
  AiAutomationConfig,
  AutomationMacro,
  CookieAutomationRule,
  CookieSnapshot,
  CustomScript,
  HotkeyBinding,
  HotkeyCommandId,
  MacroStep,
  ScriptRunTiming,
} from './types';
import { matchesUrlPattern } from './url-automation';
import { generateId } from './utils';

// ============================================================================
// 1. Execute Custom Scripts & AI Automation
// ============================================================================

/**
 * Manifest V3 CSP-safe DOM snippet interpreter (no eval / new Function).
 * Supports common automation expressions: querySelector/querySelectorAll click,
 * remove, check, value assignment, and window.scrollTo.
 */
function runSafeDomCode(code: string, doc: Document, win: Window): number {
  let ops = 0;
  const statements = code
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('//'));

  for (const stmt of statements) {
    const clickMatch = stmt.match(
      /querySelector(?:All)?\(\s*(['"`])(.+?)\1\s*\)(?:\?\.click\(\)|\.click\(\)|\.forEach\([^)]*click\(\)[^)]*\))/,
    );
    if (clickMatch?.[2]) {
      doc.querySelectorAll(clickMatch[2]).forEach((el) => {
        if (dispatchRealisticClick(el)) ops++;
      });
      continue;
    }

    const removeMatch = stmt.match(
      /querySelector(?:All)?\(\s*(['"`])(.+?)\1\s*\)(?:\?\.remove\(\)|\.remove\(\)|\.forEach\([^)]*remove\(\)[^)]*\))/,
    );
    if (removeMatch?.[2]) {
      doc.querySelectorAll(removeMatch[2]).forEach((el) => {
        el.remove();
        ops++;
      });
      continue;
    }

    const valMatch = stmt.match(
      /(?:querySelector|getElementById)\(\s*(['"`])(.+?)\1\s*\)\.value\s*=\s*(['"`])(.*?)\3/,
    );
    if (valMatch?.[2] !== undefined && valMatch[4] !== undefined) {
      const sel = stmt.includes('getElementById')
        ? `#${valMatch[2].replace(/^#/, '')}`
        : valMatch[2];
      const input = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
      if (input) {
        setReactiveInputValue(input, valMatch[4]);
        ops++;
      }
      continue;
    }

    if (/window\.scrollTo/i.test(stmt)) {
      try {
        win.scrollTo({ top: doc.body?.scrollHeight ?? 0, behavior: 'smooth' });
      } catch {
        // Ignore non-scrolling host
      }
      ops++;
    }
  }
  return ops;
}
export function setReactiveInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Execute all matching enabled Marketplace / Custom / AI scripts for a URL and timing.
 */
export async function executeMatchingScripts(params: {
  scripts: CustomScript[];
  url: string;
  timing: ScriptRunTiming;
  doc?: Document;
  win?: Window;
  allowCustomJsEval?: boolean;
}): Promise<
  Array<{
    scriptId: string;
    name: string;
    executed: boolean;
    affectedCount: number;
    extractedTexts: string[];
    error?: string;
  }>
> {
  const doc = params.doc ?? document;
  const win = params.win ?? window;
  const outcomes: Array<{
    scriptId: string;
    name: string;
    executed: boolean;
    affectedCount: number;
    extractedTexts: string[];
    error?: string;
  }> = [];

  const matching = params.scripts.filter(
    (s) =>
      s.enabled &&
      s.timing === params.timing &&
      (s.urlPattern === '*' || matchesUrlPattern(params.url, s.urlPattern, 'wildcard')),
  );

  for (const script of matching) {
    let affectedCount = 0;
    const extractedTexts: string[] = [];
    try {
      for (const action of script.actions) {
        switch (action.type) {
          case 'click_selector': {
            if (!action.selector) break;
            const els = Array.from(doc.querySelectorAll(action.selector));
            for (const el of els) {
              if (dispatchRealisticClick(el)) affectedCount++;
            }
            break;
          }
          case 'remove_selector': {
            if (!action.selector) break;
            const els = Array.from(doc.querySelectorAll(action.selector));
            for (const el of els) {
              el.remove();
              affectedCount++;
            }
            break;
          }
          case 'scroll_bottom': {
            try {
              win.scrollTo({
                top: doc.body?.scrollHeight ?? 0,
                behavior: 'smooth',
              });
            } catch {
              // Ignore in non-scrolling host
            }
            affectedCount++;
            break;
          }
          case 'check_input': {
            if (!action.selector) break;
            const inputs = Array.from(
              doc.querySelectorAll<HTMLInputElement>(action.selector),
            );
            for (const input of inputs) {
              if (!input.checked) {
                input.checked = true;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                affectedCount++;
              }
            }
            break;
          }
          case 'fill_input': {
            if (!action.selector) break;
            const el = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(
              action.selector,
            );
            if (el) {
              setReactiveInputValue(el, action.value ?? '');
              affectedCount++;
            }
            break;
          }
          case 'extract_text': {
            if (!action.selector) break;
            const els = Array.from(doc.querySelectorAll(action.selector));
            for (const el of els) {
              const txt = (el.textContent || '').trim();
              if (txt) {
                extractedTexts.push(txt);
                affectedCount++;
              }
            }
            break;
          }
          case 'custom_js': {
            const code = action.value || script.code;
            if (code) {
              affectedCount += runSafeDomCode(code, doc, win);
            }
            break;
          }
        }
      }

      // If a custom user script defines DOM statements without structured actions, execute safely
      if (script.actions.length === 0 && script.code.trim()) {
        affectedCount += runSafeDomCode(script.code, doc, win);
      }

      outcomes.push({
        scriptId: script.id,
        name: script.name,
        executed: true,
        affectedCount,
        extractedTexts,
      });
    } catch (err) {
      outcomes.push({
        scriptId: script.id,
        name: script.name,
        executed: false,
        affectedCount,
        extractedTexts,
        error: err instanceof Error ? err.message : 'Script execution failed',
      });
    }
  }

  return outcomes;
}

/**
 * Create a user-authored CustomScript with validated defaults.
 */
export function createCustomUserScript(params: {
  name: string;
  description?: string;
  urlPattern?: string;
  timing?: ScriptRunTiming;
  code?: string;
  actions?: CustomScript['actions'];
  source?: CustomScript['source'];
}): CustomScript {
  return {
    id: generateId('scr'),
    name: params.name.trim() || 'Untitled Script',
    description: params.description?.trim() || 'Custom automation script',
    source: params.source ?? 'custom',
    category: params.source === 'ai' ? 'AI Generated' : 'Custom',
    enabled: true,
    urlPattern: params.urlPattern?.trim() || '*',
    timing: params.timing ?? 'after_load',
    code: params.code?.trim() || '',
    actions: params.actions ?? [],
    installedAt: Date.now(),
  };
}

/**
 * Offline deterministic natural-language prompt -> Macro + CustomScript compiler
 * used when no API key is set or when offline.
 */
export function compilePromptOffline(prompt: string): {
  script: CustomScript;
  macro: AutomationMacro;
  usedAiApi: false;
} {
  const steps: MacroStep[] = [];
  const actions: CustomScript['actions'] = [];
  const codeLines: string[] = [];

  // Split natural prompt on "then", "and then", semicolons, or commas followed by verbs
  const clauses = prompt
    .split(/\b(?:and\s+then|then)\b|[;\n]|,\s*(?=(?:click|fill|type|enter|wait|scroll|remove|check|select|open|go to)\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    // Wait N seconds / ms
    const waitMatch = clause.match(/wait\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?)/i);
    if (waitMatch?.[1] && waitMatch[2]) {
      const num = Number(waitMatch[1]);
      const unit = waitMatch[2].toLowerCase();
      const ms = unit.startsWith('ms') || unit.startsWith('milli') ? num : Math.round(num * 1000);
      steps.push({ id: generateId('step'), type: 'wait', label: `Wait ${ms}ms`, delayMs: ms });
      codeLines.push(`await new Promise(r => setTimeout(r, ${ms}));`);
      continue;
    }

    // Fill / type / enter value into selector
    const fillMatch = clause.match(
      /(?:fill|type|enter)\s+["']?([^"']+?)["']?\s+(?:into|in)\s+([#.\w[\]="'-]+)/i,
    );
    if (fillMatch?.[1] && fillMatch[2]) {
      const value = fillMatch[1].trim();
      const selector = normalizeHintToSelector(fillMatch[2].trim(), 'input');
      steps.push({
        id: generateId('step'),
        type: 'fill',
        label: `Fill "${value}" into ${selector}`,
        selector,
        value,
      });
      actions.push({ type: 'fill_input', selector, value });
      codeLines.push(
        `{ const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); } }`,
      );
      continue;
    }

    // Remove / hide selector
    const removeMatch = clause.match(/(?:remove|hide|dismiss)\s+([#.\w[\]="'-\s]+)/i);
    if (removeMatch?.[1]) {
      const selector = normalizeHintToSelector(removeMatch[1].trim(), 'div');
      actions.push({ type: 'remove_selector', selector });
      codeLines.push(`document.querySelectorAll(${JSON.stringify(selector)}).forEach(el => el.remove());`);
      continue;
    }

    // Check checkbox
    const checkMatch = clause.match(/check\s+([#.\w[\]="'-]+(?:\s+checkbox)?)/i);
    if (checkMatch?.[1]) {
      const raw = checkMatch[1].replace(/\s+checkbox$/i, '').trim();
      const selector = normalizeHintToSelector(raw, 'input[type="checkbox"]');
      steps.push({ id: generateId('step'), type: 'check', label: `Check ${selector}`, selector });
      actions.push({ type: 'check_input', selector });
      codeLines.push(
        `document.querySelectorAll(${JSON.stringify(selector)}).forEach(el => { if (!el.checked) el.click(); });`,
      );
      continue;
    }

    // Scroll
    if (/\bscroll\b/i.test(clause)) {
      steps.push({
        id: generateId('step'),
        type: 'scroll',
        label: 'Scroll to bottom',
        value: 'bottom',
      });
      actions.push({ type: 'scroll_bottom' });
      codeLines.push(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });`);
      continue;
    }

    // Click
    const clickMatch = clause.match(/click(?:\s+on|\s+the)?\s+(.+)/i);
    if (clickMatch?.[1]) {
      const hint = clickMatch[1].replace(/^["']|["']$/g, '').trim();
      const selector = normalizeHintToSelector(hint, 'button');
      steps.push({
        id: generateId('step'),
        type: 'click',
        label: `Click ${selector}`,
        selector,
      });
      actions.push({ type: 'click_selector', selector });
      codeLines.push(`document.querySelector(${JSON.stringify(selector)})?.click();`);
      continue;
    }
  }

  if (steps.length === 0 && actions.length === 0) {
    actions.push({ type: 'scroll_bottom' });
    steps.push({
      id: generateId('step'),
      type: 'scroll',
      label: 'Scroll page to inspect content',
      value: 'bottom',
    });
    codeLines.push(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });`);
  }

  const shortTitle = prompt.trim().slice(0, 48);
  const script = createCustomUserScript({
    name: `AI: ${shortTitle}`,
    description: `Generated from prompt: "${prompt.trim()}"`,
    source: 'ai',
    timing: 'on_detection',
    code: codeLines.join('\n'),
    actions,
  });

  const macro: AutomationMacro = {
    id: generateId('macro'),
    name: `AI Macro: ${shortTitle}`,
    description: `Generated from prompt: "${prompt.trim()}"`,
    enabled: true,
    runOnDetection: true,
    steps,
    createdAt: Date.now(),
  };

  return { script, macro, usedAiApi: false };
}

function normalizeHintToSelector(hint: string, fallbackTag: string): string {
  if (/^[#.\[]/.test(hint) || /^(button|input|a|div|select|form)[#.\[]/i.test(hint)) {
    return hint;
  }
  const slug = hint
    .toLowerCase()
    .replace(/\b(button|field|input|box|element|modal|banner)\b/g, '')
    .trim()
    .replace(/\s+/g, '-');
  if (!slug) return fallbackTag;
  if (fallbackTag === 'input') {
    return `input[name*="${slug}"], #${slug}, .${slug}`;
  }
  return `#${slug}, .${slug}, [data-testid*="${slug}"]`;
}

/**
 * BYO API Key AI Automation Generator (OpenAI-compatible Chat Completions endpoint)
 * Falls back cleanly to deterministic compilePromptOffline() when no key is provided.
 */
export async function generateAiAutomation(params: {
  prompt: string;
  aiConfig: AiAutomationConfig;
  fetcher?: typeof fetch;
}): Promise<{
  script: CustomScript;
  macro: AutomationMacro;
  usedAiApi: boolean;
}> {
  const { prompt, aiConfig } = params;
  if (!aiConfig.apiKey.trim() || !aiConfig.endpointUrl.trim()) {
    return compilePromptOffline(prompt);
  }

  const fetchFn = params.fetcher ?? globalThis.fetch;
  const systemPrompt =
    'You generate browser automation JSON for PulseRefresh. Return ONLY valid JSON with shape: {"name":string,"description":string,"code":string,"actions":[{"type":"click_selector"|"remove_selector"|"scroll_bottom"|"check_input"|"fill_input"|"extract_text","selector"?:string,"value"?:string}],"steps":[{"type":"click"|"fill"|"select"|"check"|"scroll"|"wait"|"wait_for_selector","selector"?:string,"value"?:string,"delayMs"?:number,"label"?:string}]}';

  const res = await fetchFn(aiConfig.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: aiConfig.model || 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI endpoint returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content || '';
  const jsonBlock = rawContent.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(jsonBlock) as {
    name?: string;
    description?: string;
    code?: string;
    actions?: CustomScript['actions'];
    steps?: Array<Omit<MacroStep, 'id'>>;
  };

  const script = createCustomUserScript({
    name: parsed.name || `AI: ${prompt.slice(0, 40)}`,
    description: parsed.description || prompt,
    source: 'ai',
    timing: 'on_detection',
    code: parsed.code || '',
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  });

  const macro: AutomationMacro = {
    id: generateId('macro'),
    name: parsed.name || `AI Macro: ${prompt.slice(0, 40)}`,
    description: parsed.description || prompt,
    enabled: true,
    runOnDetection: true,
    createdAt: Date.now(),
    steps: (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => ({
      ...s,
      id: generateId('step'),
    })),
  };

  return { script, macro, usedAiApi: true };
}

// ============================================================================
// 2. Hotkeys (Keyboard Shortcuts)
// ============================================================================

export function normalizeHotkeyCombo(combo: string): string {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const mods: string[] = [];
  let mainKey = '';

  for (const part of parts) {
    const low = part.toLowerCase();
    if (low === 'ctrl' || low === 'control') mods.push('Ctrl');
    else if (low === 'alt' || low === 'option') mods.push('Alt');
    else if (low === 'shift') mods.push('Shift');
    else if (low === 'meta' || low === 'cmd' || low === 'command') mods.push('Meta');
    else if (low === ' ' || low === 'space' || low === 'spacebar') mainKey = 'Space';
    else mainKey = part.length === 1 ? part.toUpperCase() : part;
  }

  const orderedMods = ['Ctrl', 'Alt', 'Shift', 'Meta'].filter((m) =>
    mods.includes(m),
  );
  return [...orderedMods, mainKey].filter(Boolean).join('+');
}

export function keyboardEventToCombo(event: KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');

  let keyName = event.key;
  if (event.code === 'Space' || event.key === ' ') {
    keyName = 'Space';
  } else if (event.code?.startsWith('Key') && event.code.length === 4) {
    keyName = event.code.slice(3).toUpperCase();
  } else if (event.code?.startsWith('Digit') && event.code.length === 6) {
    keyName = event.code.slice(5);
  } else if (keyName.length === 1) {
    keyName = keyName.toUpperCase();
  }

  parts.push(keyName);
  return normalizeHotkeyCombo(parts.join('+'));
}

export function matchHotkeyEvent(
  event: KeyboardEvent,
  bindings: HotkeyBinding[],
): HotkeyCommandId | null {
  // Don't hijack plain typing inside input/textarea unless Alt or Ctrl or Meta is held
  const target = event.target as HTMLElement | null;
  const inEditable =
    target &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable);
  if (inEditable && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return null;
  }

  const combo = keyboardEventToCombo(event);
  if (!combo) return null;

  for (const binding of bindings) {
    if (!binding.enabled || !binding.inPageEnabled) continue;
    if (normalizeHotkeyCombo(binding.combo) === combo) {
      return binding.id;
    }
  }
  return null;
}

export function findHotkeyConflicts(
  bindings: HotkeyBinding[],
): Array<{ combo: string; commandIds: HotkeyCommandId[] }> {
  const map = new Map<string, HotkeyCommandId[]>();
  for (const b of bindings) {
    if (!b.enabled || !b.combo.trim()) continue;
    const norm = normalizeHotkeyCombo(b.combo);
    const list = map.get(norm) ?? [];
    list.push(b.id);
    map.set(norm, list);
  }
  return Array.from(map.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([combo, commandIds]) => ({ combo, commandIds }));
}

// ============================================================================
// 3. Cookie Automation
// ============================================================================

function buildCookieUrl(
  cookie: { domain: string; path: string; secure: boolean },
  fallbackUrl: string,
): string {
  try {
    const cleanDomain = cookie.domain.replace(/^\./, '');
    const proto = cookie.secure ? 'https' : 'http';
    const path = cookie.path || '/';
    return `${proto}://${cleanDomain}${path}`;
  } catch {
    return fallbackUrl;
  }
}

export function domainMatchesCookieRule(url: string, domainPattern: string): boolean {
  const cleanPattern = domainPattern.trim().toLowerCase();
  if (!cleanPattern || cleanPattern === '*') return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (cleanPattern.includes('*')) {
      return matchesUrlPattern(host, cleanPattern, 'wildcard');
    }
    const bare = cleanPattern.replace(/^\./, '');
    return host === bare || host.endsWith(`.${bare}`);
  } catch {
    return false;
  }
}

export async function executeCookieAutomationRules(params: {
  url: string;
  timing: 'before_refresh' | 'after_load';
  rules: CookieAutomationRule[];
}): Promise<{ removedCount: number; setCount: number; appliedRuleIds: string[] }> {
  const b = getBrowser();
  if (!b.cookies || !/^https?:\/\//i.test(params.url)) {
    return { removedCount: 0, setCount: 0, appliedRuleIds: [] };
  }

  const applicable = params.rules.filter(
    (r) =>
      r.enabled &&
      r.timing === params.timing &&
      domainMatchesCookieRule(params.url, r.domainPattern),
  );

  let removedCount = 0;
  let setCount = 0;
  const appliedRuleIds: string[] = [];

  for (const rule of applicable) {
    appliedRuleIds.push(rule.id);

    if (rule.action === 'clear_all') {
      const cookies = await b.cookies.getAll({ url: params.url });
      for (const c of cookies) {
        await b.cookies.remove({
          url: buildCookieUrl(c, params.url),
          name: c.name,
        });
        removedCount++;
      }
    } else if (rule.action === 'delete_matching') {
      const cookies = await b.cookies.getAll({ url: params.url });
      const patterns = rule.cookieNames.map((n) => n.trim()).filter(Boolean);
      for (const c of cookies) {
        const matched = patterns.some((pat) =>
          pat.includes('*')
            ? matchesUrlPattern(c.name, pat, 'wildcard')
            : c.name === pat,
        );
        if (matched) {
          await b.cookies.remove({
            url: buildCookieUrl(c, params.url),
            name: c.name,
          });
          removedCount++;
        }
      }
    } else if (rule.action === 'keep_only') {
      const cookies = await b.cookies.getAll({ url: params.url });
      const allowSet = new Set(
        rule.cookieNames.map((n) => n.trim()).filter(Boolean),
      );
      for (const c of cookies) {
        if (!allowSet.has(c.name)) {
          await b.cookies.remove({
            url: buildCookieUrl(c, params.url),
            name: c.name,
          });
          removedCount++;
        }
      }
    } else if (rule.action === 'set_cookie' && rule.cookieToSet?.name) {
      const spec = rule.cookieToSet;
      const isHttps = params.url.startsWith('https://');
      const exp = spec.expirationSeconds
        ? Math.floor(Date.now() / 1000) + spec.expirationSeconds
        : undefined;
      await b.cookies.set({
        url: params.url,
        name: spec.name,
        value: spec.value ?? '',
        path: spec.path || '/',
        secure: spec.secure ?? isHttps,
        sameSite: spec.sameSite ?? 'lax',
        ...(exp ? { expirationDate: exp } : {}),
      });
      setCount++;
    }
  }

  return { removedCount, setCount, appliedRuleIds };
}

export async function captureCookieSnapshot(
  url: string,
  name?: string,
): Promise<CookieSnapshot> {
  const b = getBrowser();
  const parsed = new URL(url);
  const cookies = b.cookies ? await b.cookies.getAll({ url }) : [];
  return {
    id: generateId('csnap'),
    name: name?.trim() || `${parsed.hostname} snapshot`,
    domain: parsed.hostname,
    createdAt: Date.now(),
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite as CookieSnapshot['cookies'][number]['sameSite'],
      expirationDate: c.expirationDate,
    })),
  };
}

export async function restoreCookieSnapshot(
  snapshot: CookieSnapshot,
  targetUrl?: string,
): Promise<number> {
  const b = getBrowser();
  if (!b.cookies) return 0;
  let restored = 0;
  for (const c of snapshot.cookies) {
    const url = targetUrl || buildCookieUrl(c, `https://${snapshot.domain}/`);
    await b.cookies.set({
      url,
      name: c.name,
      value: c.value,
      path: c.path || '/',
      secure: c.secure,
      httpOnly: c.httpOnly,
      ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
    });
    restored++;
  }
  return restored;
}

// ============================================================================
// 4. Run Macro After Detection (+ Live DOM Macro Recorder)
// ============================================================================

export interface MacroStepResult {
  stepId: string;
  type: MacroStep['type'];
  ok: boolean;
  output?: string;
  error?: string;
}

export interface MacroRunReport {
  macroId: string;
  ok: boolean;
  completedSteps: number;
  totalSteps: number;
  stepResults: MacroStepResult[];
  extractedValues: string[];
}

export async function executeAutomationMacro(params: {
  macro: AutomationMacro;
  doc?: Document;
  win?: Window;
  onNavigate?: (url: string) => void | Promise<void>;
  fetcher?: typeof fetch;
}): Promise<MacroRunReport> {
  const { macro } = params;
  const doc = params.doc ?? document;
  const win = params.win ?? window;
  const fetchFn = params.fetcher ?? globalThis.fetch;

  const stepResults: MacroStepResult[] = [];
  const extractedValues: string[] = [];
  let overallOk = true;

  for (const step of macro.steps) {
    if (step.delayMs && step.delayMs > 0 && step.type !== 'wait') {
      await new Promise((r) => setTimeout(r, step.delayMs));
    }

    try {
      let output: string | undefined;

      switch (step.type) {
        case 'wait': {
          const waitMs = Math.max(0, step.delayMs ?? (Number(step.value) || 250));
          await new Promise((r) => setTimeout(r, waitMs));
          output = `Waited ${waitMs}ms`;
          break;
        }

        case 'wait_for_selector': {
          const el = await waitForTargetElement({
            doc,
            selector: step.selector || '',
            timeoutMs: step.timeoutMs ?? 3000,
          });
          if (!el) throw new Error(`Timed out waiting for ${step.selector}`);
          output = `Found ${step.selector}`;
          break;
        }

        case 'click': {
          const el = await waitForTargetElement({
            doc,
            selector: step.selector || '',
            timeoutMs: step.timeoutMs ?? 1500,
          });
          if (!el) throw new Error(`Click target not found: ${step.selector}`);
          if (!dispatchRealisticClick(el)) {
            throw new Error(`Click target is disabled: ${step.selector}`);
          }
          output = `Clicked ${step.selector}`;
          break;
        }

        case 'fill': {
          const el = (await waitForTargetElement({
            doc,
            selector: step.selector || '',
            timeoutMs: step.timeoutMs ?? 1500,
          })) as HTMLInputElement | HTMLTextAreaElement | null;
          if (!el) throw new Error(`Input not found: ${step.selector}`);
          setReactiveInputValue(el, step.value ?? '');
          output = `Filled ${step.selector}`;
          break;
        }

        case 'select': {
          const el = (await waitForTargetElement({
            doc,
            selector: step.selector || '',
            timeoutMs: step.timeoutMs ?? 1500,
          })) as HTMLSelectElement | null;
          if (!el) throw new Error(`Select not found: ${step.selector}`);
          el.value = step.value ?? '';
          el.dispatchEvent(new Event('change', { bubbles: true }));
          output = `Selected "${step.value}"`;
          break;
        }

        case 'check': {
          const el = (await waitForTargetElement({
            doc,
            selector: step.selector || '',
            timeoutMs: step.timeoutMs ?? 1500,
          })) as HTMLInputElement | null;
          if (!el) throw new Error(`Checkbox not found: ${step.selector}`);
          const desired = step.value === 'false' ? false : true;
          el.checked = desired;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          output = `Set checked=${desired}`;
          break;
        }

        case 'keypress': {
          const target = step.selector
            ? doc.querySelector(step.selector) ?? doc.activeElement ?? doc.body
            : doc.activeElement ?? doc.body;
          const key = step.value || 'Enter';
          target.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
          );
          target.dispatchEvent(
            new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }),
          );
          output = `Pressed ${key}`;
          break;
        }

        case 'scroll': {
          if (step.selector) {
            const el = doc.querySelector(step.selector);
            if (!el) throw new Error(`Scroll target not found: ${step.selector}`);
            el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          } else {
            const y =
              step.value === 'top'
                ? 0
                : step.value === 'bottom'
                  ? doc.body?.scrollHeight ?? 0
                  : Number(step.value) || 500;
            try {
              win.scrollTo({ top: y, behavior: 'smooth' });
            } catch {
              // Ignore in jsdom
            }
          }
          output = 'Scrolled';
          break;
        }

        case 'extract_text': {
          const el = await waitForTargetElement({
            doc,
            selector: step.selector || '',
            timeoutMs: step.timeoutMs ?? 1000,
          });
          if (!el) throw new Error(`Extract element not found: ${step.selector}`);
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          extractedValues.push(text);
          output = text;
          break;
        }

        case 'navigate': {
          const url = (step.value || '').trim();
          if (!url) throw new Error('Navigation URL is empty');
          if (params.onNavigate) {
            await params.onNavigate(url);
          } else {
            win.location.assign(url);
          }
          output = `Navigated to ${url}`;
          break;
        }

        case 'webhook': {
          const url = (step.value || '').trim();
          if (!url) throw new Error('Webhook step URL is empty');
          const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              macroId: macro.id,
              macroName: macro.name,
              extractedValues,
              pageUrl: win.location?.href ?? '',
              timestamp: new Date().toISOString(),
            }),
          });
          if (!res.ok) throw new Error(`Macro webhook HTTP ${res.status}`);
          output = `Webhook HTTP ${res.status}`;
          break;
        }
      }

      stepResults.push({
        stepId: step.id,
        type: step.type,
        ok: true,
        output,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Macro step failed';
      stepResults.push({
        stepId: step.id,
        type: step.type,
        ok: false,
        error: errMsg,
      });
      if (!step.continueOnError) {
        overallOk = false;
        break;
      }
    }
  }

  return {
    macroId: macro.id,
    ok: overallOk,
    completedSteps: stepResults.filter((r) => r.ok).length,
    totalSteps: macro.steps.length,
    stepResults,
    extractedValues,
  };
}

/**
 * Live DOM Macro Recorder — records user clicks, text fills, selects, and checks
 * into clean MacroStep objects!
 */
export function startMacroRecorder(
  doc: Document = document,
  onStepRecorded?: (step: MacroStep) => void,
): { stop: () => MacroStep[]; getSteps: () => MacroStep[] } {
  const steps: MacroStep[] = [];

  const push = (step: MacroStep) => {
    steps.push(step);
    onStepRecorded?.(step);
  };

  const isIgnored = (el: Element | null): boolean =>
    !el || Boolean(el.closest(`[${EXTENSION_UI_ATTR}]`));

  const onClick = (e: MouseEvent) => {
    const el = e.target as Element | null;
    if (!el || isIgnored(el)) return;
    if (
      el instanceof HTMLInputElement &&
      !['submit', 'button', 'reset'].includes(el.type)
    ) {
      return; // handled by change listener
    }
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return;
    }
    const selector = generateUniqueCssSelector(el);
    push({
      id: generateId('step'),
      type: 'click',
      label: `Click ${selector}`,
      selector,
    });
  };

  const onChange = (e: Event) => {
    const el = e.target as Element | null;
    if (!el || isIgnored(el)) return;
    const selector = generateUniqueCssSelector(el);

    if (el instanceof HTMLSelectElement) {
      push({
        id: generateId('step'),
        type: 'select',
        label: `Select "${el.value}" in ${selector}`,
        selector,
        value: el.value,
      });
    } else if (
      el instanceof HTMLInputElement &&
      (el.type === 'checkbox' || el.type === 'radio')
    ) {
      push({
        id: generateId('step'),
        type: 'check',
        label: `${el.checked ? 'Check' : 'Uncheck'} ${selector}`,
        selector,
        value: String(el.checked),
      });
    } else if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement
    ) {
      push({
        id: generateId('step'),
        type: 'fill',
        label: `Fill ${selector}`,
        selector,
        value: el.value,
      });
    }
  };

  doc.addEventListener('click', onClick, true);
  doc.addEventListener('change', onChange, true);

  return {
    getSteps: () => [...steps],
    stop: () => {
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('change', onChange, true);
      return [...steps];
    },
  };
}
