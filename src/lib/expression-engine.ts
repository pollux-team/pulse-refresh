import type {
  KeywordMatchLogic,
  KeywordTemplate,
  NumericOperator,
  TargetKeywordRule,
} from './types';
import { generateId } from './utils';

export interface SingleRuleMatch {
  ruleId: string;
  matched: boolean;
  matchedText: string;
  snippet: string;
  matchCount: number;
  matchedElements: Element[];
  extractedNumber?: number | null;
}

export interface KeywordEvaluationSummary {
  matched: boolean;
  matchedRules: SingleRuleMatch[];
  matchedKeywords: string[];
  snippet: string;
  totalMatchCount: number;
  matchedElements: Element[];
  extractedNumber: number | null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate a user-supplied expression syntax before saving.
 */
export function validateExpression(
  expression: string,
  type: TargetKeywordRule['type'],
): { valid: boolean; error?: string } {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { valid: false, error: 'Expression cannot be empty.' };
  }
  if (type === 'regex') {
    try {
      compileRegexExpression(trimmed, false);
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid regular expression',
      };
    }
  }
  if (type === 'numeric') {
    const parsed = parseNumericExpression(trimmed);
    if (!parsed) {
      return {
        valid: false,
        error: 'Expected numeric operator & number, e.g. "< 99.99" or ">= 10" or "pct_change 5".',
      };
    }
    return { valid: true };
  }
  if (type === 'css') {
    const sel = trimmed.replace(/^css:/i, '').trim();
    if (!sel) return { valid: false, error: 'CSS selector cannot be empty.' };
    if (typeof document !== 'undefined') {
      try {
        document.createDocumentFragment().querySelector(sel);
      } catch {
        return { valid: false, error: `Invalid CSS selector: ${sel}` };
      }
    }
  }
  return { valid: true };
}

export function compileRegexExpression(
  expression: string,
  caseSensitive: boolean,
): RegExp {
  const slashMatch = expression.match(/^\/(.+)\/([gimsuy]*)$/);
  if (slashMatch?.[1] !== undefined) {
    const body = slashMatch[1];
    let flags = slashMatch[2] ?? '';
    if (!flags.includes('g')) flags += 'g';
    return new RegExp(body, flags);
  }
  const flags = caseSensitive ? 'g' : 'gi';
  return new RegExp(expression, flags);
}

export function compileWildcardExpression(
  expression: string,
  caseSensitive: boolean,
): RegExp {
  const body = expression
    .split(/(\*|\?)/)
    .map((part) => {
      if (part === '*') return '[\\s\\S]{0,160}?';
      if (part === '?') return '.';
      return escapeRegExp(part);
    })
    .join('');
  return new RegExp(body, caseSensitive ? 'g' : 'gi');
}

export function extractFirstNumber(text: string): number | null {
  // Match currency/decimal numbers like "$1,299.95", "-42.5", "89", "€19,99"
  const match = text.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const cleaned = match[0].replace(/,/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseNumericExpression(
  expr: string,
): { operator: NumericOperator; value: number } | null {
  const cleaned = expr.replace(/^(price|value|num)\s*/i, '').trim();
  const pctMatch = cleaned.match(/^(?:pct_change|%)\s*([+-]?\d+(?:\.\d+)?)%?$/i);
  if (pctMatch) {
    return { operator: 'pct_change', value: Number(pctMatch[1]) };
  }
  const match = cleaned.match(/^(<=|>=|==|!=|<|>|=)\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)$/);
  if (!match?.[1] || !match[2]) return null;
  const rawOp = match[1] === '=' ? '==' : (match[1] as NumericOperator);
  const val = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(val)) return null;
  return { operator: rawOp, value: val };
}

export function compareNumericThreshold(params: {
  current: number;
  operator: NumericOperator;
  target: number;
  baseline?: number | null;
}): boolean {
  const { current, operator, target, baseline } = params;
  switch (operator) {
    case '<':
      return current < target;
    case '<=':
      return current <= target;
    case '>':
      return current > target;
    case '>=':
      return current >= target;
    case '==':
      return Math.abs(current - target) < 1e-9;
    case '!=':
      return Math.abs(current - target) >= 1e-9;
    case 'pct_change': {
      if (baseline == null || baseline === 0) return false;
      const pct = Math.abs(((current - baseline) / baseline) * 100);
      return pct >= Math.abs(target);
    }
    default:
      return false;
  }
}

/**
 * Recursive-descent Boolean Expression evaluator supporting:
 *   - Quoted phrases: "Add to Cart"
 *   - Bare words: Available
 *   - Operators: AND (&&), OR (||), NOT (!)
 *   - Parentheses: ("In Stock" OR "Buy Now") AND NOT "Sold Out"
 */
type BoolToken =
  | { kind: 'LPAREN' }
  | { kind: 'RPAREN' }
  | { kind: 'AND' }
  | { kind: 'OR' }
  | { kind: 'NOT' }
  | { kind: 'TERM'; value: string };

function tokenizeBoolean(input: string): BoolToken[] {
  const tokens: BoolToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'LPAREN' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'RPAREN' });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let buf = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
        }
        buf += input[i++]!;
      }
      if (input[i] === quote) i++;
      tokens.push({ kind: 'TERM', value: buf });
      continue;
    }
    if (input.slice(i, i + 2) === '&&') {
      tokens.push({ kind: 'AND' });
      i += 2;
      continue;
    }
    if (input.slice(i, i + 2) === '||') {
      tokens.push({ kind: 'OR' });
      i += 2;
      continue;
    }
    if (ch === '!') {
      tokens.push({ kind: 'NOT' });
      i++;
      continue;
    }

    let word = '';
    while (i < input.length && !/[\s()"']/.test(input[i]!)) {
      word += input[i++]!;
    }
    const upper = word.toUpperCase();
    if (upper === 'AND') tokens.push({ kind: 'AND' });
    else if (upper === 'OR') tokens.push({ kind: 'OR' });
    else if (upper === 'NOT') tokens.push({ kind: 'NOT' });
    else if (word) tokens.push({ kind: 'TERM', value: word });
  }
  return tokens;
}

export function evaluateBooleanExpression(
  expression: string,
  haystack: string,
  caseSensitive = false,
): { matched: boolean; matchedTerms: string[] } {
  const tokens = tokenizeBoolean(expression);
  if (tokens.length === 0) return { matched: false, matchedTerms: [] };

  const normalizedHaystack = caseSensitive ? haystack : haystack.toLowerCase();
  const positiveHits: string[] = [];
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseNot(negated: boolean): boolean {
    if (peek()?.kind === 'NOT') {
      consume();
      return !parseNot(!negated);
    }
    return parsePrimary(negated);
  }

  function parseAnd(): boolean {
    let left = parseNot(false);
    while (
      peek()?.kind === 'AND' ||
      peek()?.kind === 'TERM' ||
      peek()?.kind === 'LPAREN' ||
      peek()?.kind === 'NOT'
    ) {
      if (peek()?.kind === 'AND') consume();
      const right = parseNot(false);
      left = left && right;
    }
    return left;
  }

  function parseOr(): boolean {
    let left = parseAnd();
    while (peek()?.kind === 'OR') {
      consume();
      const right = parseAnd();
      left = left || right;
    }
    return left;
  }

  function parsePrimary(negated: boolean): boolean {
    const tok = peek();
    if (!tok) return false;
    if (tok.kind === 'LPAREN') {
      consume();
      const val = parseOr();
      if (peek()?.kind === 'RPAREN') consume();
      return val;
    }
    if (tok.kind === 'TERM') {
      consume();
      const needle = caseSensitive ? tok.value : tok.value.toLowerCase();
      const found = needle.length > 0 && normalizedHaystack.includes(needle);
      if (found && !negated && !positiveHits.includes(tok.value)) {
        positiveHits.push(tok.value);
      }
      return found;
    }
    consume();
    return false;
  }

  const matched = parseOr();
  return { matched, matchedTerms: matched ? positiveHits : [] };
}

function buildContextSnippet(text: string, index: number, matchLen: number): string {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + matchLen + 55);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

export function queryXPathElements(root: Element | Document, xpath: string): Element[] {
  const doc = root instanceof Document ? root : root.ownerDocument;
  if (!doc || typeof doc.evaluate !== 'function') return [];
  const results: Element[] = [];
  try {
    const snapshot = doc.evaluate(
      xpath,
      root,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    for (let i = 0; i < snapshot.snapshotLength; i++) {
      const node = snapshot.snapshotItem(i);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        results.push(node as Element);
      }
    }
  } catch {
    // Invalid XPath
  }
  return results;
}

/**
 * Evaluate a single TargetKeywordRule against text + optional DOM root.
 */
export function evaluateKeywordRule(
  rule: TargetKeywordRule,
  text: string,
  options: { root?: Element | Document | null; baselineNumber?: number | null } = {},
): SingleRuleMatch {
  const empty: SingleRuleMatch = {
    ruleId: rule.id,
    matched: false,
    matchedText: '',
    snippet: '',
    matchCount: 0,
    matchedElements: [],
    extractedNumber: null,
  };

  const expr = rule.expression.trim();
  if (!rule.enabled || !expr) return empty;

  // Skip unresolved template placeholders like {{product}}
  if (/^\{\{[^}]+\}\}$/.test(expr)) return empty;

  switch (rule.type) {
    case 'plain': {
      const escaped = escapeRegExp(expr);
      const pattern = rule.wholeWord ? `\\b${escaped}\\b` : escaped;
      const rx = new RegExp(pattern, rule.caseSensitive ? 'g' : 'gi');
      const matches = Array.from(text.matchAll(rx));
      const first = matches[0];
      if (!first) return empty;
      return {
        ruleId: rule.id,
        matched: true,
        matchedText: first[0],
        snippet: buildContextSnippet(text, first.index ?? 0, first[0].length),
        matchCount: matches.length,
        matchedElements: [],
      };
    }

    case 'wildcard': {
      const rx = compileWildcardExpression(expr, rule.caseSensitive);
      const matches = Array.from(text.matchAll(rx));
      const first = matches[0];
      if (!first) return empty;
      return {
        ruleId: rule.id,
        matched: true,
        matchedText: first[0],
        snippet: buildContextSnippet(text, first.index ?? 0, first[0].length),
        matchCount: matches.length,
        matchedElements: [],
      };
    }

    case 'regex': {
      try {
        const rx = compileRegexExpression(expr, rule.caseSensitive);
        const matches = Array.from(text.matchAll(rx));
        const first = matches[0];
        if (!first) return empty;
        return {
          ruleId: rule.id,
          matched: true,
          matchedText: first[0],
          snippet: buildContextSnippet(text, first.index ?? 0, first[0].length),
          matchCount: matches.length,
          matchedElements: [],
        };
      } catch {
        return empty;
      }
    }

    case 'boolean': {
      const res = evaluateBooleanExpression(expr, text, rule.caseSensitive);
      if (!res.matched) return empty;
      const primary = res.matchedTerms[0] || expr;
      const idx = text.toLowerCase().indexOf(primary.toLowerCase());
      return {
        ruleId: rule.id,
        matched: true,
        matchedText: primary,
        snippet:
          idx >= 0
            ? buildContextSnippet(text, idx, primary.length)
            : text.slice(0, 110).trim(),
        matchCount: Math.max(1, res.matchedTerms.length),
        matchedElements: [],
      };
    }

    case 'css': {
      const selector = expr.replace(/^css:/i, '').trim();
      if (!options.root || !selector) return empty;
      try {
        const els = Array.from(options.root.querySelectorAll(selector));
        const firstEl = els[0];
        if (!firstEl) return empty;
        const firstText = (firstEl.textContent || '').trim().slice(0, 100);
        return {
          ruleId: rule.id,
          matched: true,
          matchedText: firstText || selector,
          snippet: firstText || `Matched CSS selector: ${selector}`,
          matchCount: els.length,
          matchedElements: els,
        };
      } catch {
        return empty;
      }
    }

    case 'xpath': {
      const xpath = expr.replace(/^xpath:/i, '').trim();
      if (!options.root || !xpath) return empty;
      const els = queryXPathElements(options.root, xpath);
      const firstEl = els[0];
      if (!firstEl) return empty;
      const firstText = (firstEl.textContent || '').trim().slice(0, 100);
      return {
        ruleId: rule.id,
        matched: true,
        matchedText: firstText || xpath,
        snippet: firstText || `Matched XPath: ${xpath}`,
        matchCount: els.length,
        matchedElements: els,
      };
    }

    case 'numeric': {
      const parsed = parseNumericExpression(expr);
      const num = extractFirstNumber(text);
      if (!parsed || num == null) {
        return { ...empty, extractedNumber: num };
      }
      const ok = compareNumericThreshold({
        current: num,
        operator: parsed.operator,
        target: parsed.value,
        baseline: options.baselineNumber,
      });
      return {
        ruleId: rule.id,
        matched: ok,
        matchedText: ok ? String(num) : '',
        snippet: ok
          ? `Detected value ${num} (${parsed.operator} ${parsed.value})`
          : '',
        matchCount: ok ? 1 : 0,
        matchedElements: [],
        extractedNumber: num,
      };
    }

    default:
      return empty;
  }
}

/**
 * Evaluate a list of target keyword rules using 'any' (OR) or 'all' (AND) logic.
 */
export function evaluateKeywordRules(
  rules: TargetKeywordRule[],
  text: string,
  logic: KeywordMatchLogic = 'any',
  options: { root?: Element | Document | null; baselineNumber?: number | null } = {},
): KeywordEvaluationSummary {
  const activeRules = rules.filter(
    (r) => r.enabled && r.expression.trim().length > 0 && !/^\{\{[^}]+\}\}$/.test(r.expression.trim()),
  );

  if (activeRules.length === 0) {
    return {
      matched: false,
      matchedRules: [],
      matchedKeywords: [],
      snippet: '',
      totalMatchCount: 0,
      matchedElements: [],
      extractedNumber: null,
    };
  }

  const evaluations = activeRules.map((r) => evaluateKeywordRule(r, text, options));
  const hits = evaluations.filter((e) => e.matched);
  const overallMatched =
    logic === 'all' ? hits.length === activeRules.length : hits.length > 0;

  const firstNum =
    evaluations.find((e) => e.extractedNumber != null)?.extractedNumber ?? null;

  return {
    matched: overallMatched,
    matchedRules: hits,
    matchedKeywords: hits.map((h) => h.matchedText).filter(Boolean),
    snippet: hits[0]?.snippet ?? '',
    totalMatchCount: hits.reduce((sum, h) => sum + h.matchCount, 0),
    matchedElements: hits.flatMap((h) => h.matchedElements),
    extractedNumber: firstNum,
  };
}

/**
 * Feature: Define Keyword Template
 * Interpolate {{variable}} placeholders and instantiate executable TargetKeywordRule items.
 */
export function instantiateKeywordTemplate(
  template: KeywordTemplate,
  variableValues: Record<string, string> = {},
): TargetKeywordRule[] {
  return template.rules
    .map((rule) => {
      let interpolated = rule.expression;
      let hasMissingRequiredVar = false;

      interpolated = interpolated.replace(/\{\{\s*(\w+)\s*\}\}/g, (_full, key: string) => {
        const val = (variableValues[key] ?? '').trim();
        if (!val) {
          hasMissingRequiredVar = true;
          return '';
        }
        return val;
      });

      const cleaned = interpolated.replace(/\s+/g, ' ').trim();
      const shouldEnable = hasMissingRequiredVar ? false : rule.enabled;

      return {
        ...rule,
        id: generateId('kw'),
        expression: cleaned || rule.expression,
        enabled: shouldEnable && cleaned.length > 0,
      };
    })
    .filter((r) => r.expression.trim().length > 0);
}

/**
 * Create a new custom KeywordTemplate and automatically extract {{variables}} used in rules.
 */
export function createCustomKeywordTemplate(params: {
  name: string;
  description?: string;
  category?: KeywordTemplate['category'];
  mode: KeywordTemplate['mode'];
  matchLogic?: KeywordMatchLogic;
  rules: Omit<TargetKeywordRule, 'id'>[];
}): KeywordTemplate {
  const vars = new Set<string>();
  for (const rule of params.rules) {
    const matches = rule.expression.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
    for (const m of matches) {
      if (m[1]) vars.add(m[1]);
    }
  }
  return {
    id: generateId('tpl'),
    name: params.name.trim(),
    description: params.description?.trim() || 'Custom keyword template',
    category: params.category ?? 'custom',
    mode: params.mode,
    matchLogic: params.matchLogic ?? 'any',
    variables: Array.from(vars),
    rules: params.rules,
    builtIn: false,
  };
}
