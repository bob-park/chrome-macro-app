import { SelectorSet } from './types';

/**
 * Generate a SelectorSet for a given DOM element.
 * Captures multiple identification strategies for resilient element finding.
 */
export function generateSelectorSet(el: Element): SelectorSet {
  return {
    css: generateCssSelector(el),
    xpath: generateXPath(el),
    textContent: getTextContent(el),
    ariaLabel: el.getAttribute('aria-label'),
    ariaRole: el.getAttribute('role'),
    testId: el.getAttribute('data-testid'),
    elementId: el.id || null,
    tagName: el.tagName.toLowerCase(),
    siblingIndex: getSiblingIndex(el),
  };
}

/**
 * Resolve an element on the page using a SelectorSet.
 * Tries strategies in priority order. Returns the first unique match.
 * Returns { element, priority } or null if no match found.
 */
export function resolveElement(
  selectors: SelectorSet
): { element: Element; priority: number } | null {
  // Priority 1: id or data-testid
  if (selectors.elementId) {
    const el = document.getElementById(selectors.elementId);
    if (el) return { element: el, priority: 1 };
  }
  if (selectors.testId) {
    const el = document.querySelector(`[data-testid="${CSS.escape(selectors.testId)}"]`);
    if (el && document.querySelectorAll(`[data-testid="${CSS.escape(selectors.testId)}"]`).length === 1) {
      return { element: el, priority: 1 };
    }
  }

  // Priority 2: ARIA label + role
  if (selectors.ariaLabel && selectors.ariaRole) {
    const selector = `[aria-label="${CSS.escape(selectors.ariaLabel)}"][role="${CSS.escape(selectors.ariaRole)}"]`;
    const matches = document.querySelectorAll(selector);
    if (matches.length === 1) return { element: matches[0], priority: 2 };
  } else if (selectors.ariaLabel) {
    const selector = `[aria-label="${CSS.escape(selectors.ariaLabel)}"]`;
    const matches = document.querySelectorAll(selector);
    if (matches.length === 1) return { element: matches[0], priority: 2 };
  }

  // Priority 3: CSS selector
  if (selectors.css) {
    try {
      const matches = document.querySelectorAll(selectors.css);
      if (matches.length === 1) return { element: matches[0], priority: 3 };
    } catch {
      // invalid selector, skip
    }
  }

  // Priority 4: XPath
  if (selectors.xpath) {
    try {
      const result = document.evaluate(
        selectors.xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      if (result.snapshotLength === 1) {
        const el = result.snapshotItem(0);
        if (el instanceof Element) return { element: el, priority: 4 };
      }
    } catch {
      // invalid xpath, skip
    }
  }

  // Priority 5: Text content match
  if (selectors.textContent && selectors.tagName) {
    const candidates = document.querySelectorAll(selectors.tagName);
    const matches: Element[] = [];
    for (const el of candidates) {
      const text = el.textContent?.trim().slice(0, 100) ?? '';
      if (isTextMatch(text, selectors.textContent)) {
        matches.push(el);
      }
    }
    if (matches.length === 1) return { element: matches[0], priority: 5 };
  }

  // Priority 6: Positional fallback (tag + sibling index)
  // Use CSS selector to scope to the correct parent's children only,
  // not all elements of that tagName across the entire page.
  if (selectors.css) {
    try {
      // Try the CSS selector path but accept even if multiple matches
      const candidates = document.querySelectorAll(selectors.css);
      if (candidates.length > 0) {
        return { element: candidates[0], priority: 6 };
      }
    } catch { /* skip */ }
  }

  return null;
}

// --- CSS Selector Generator ---

function generateCssSelector(el: Element): string {
  const path: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    // If element has an ID, use it and stop
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    let selector = current.tagName.toLowerCase();

    // Try classes first (pick the most specific combo)
    const classes = Array.from(current.classList)
      .filter(c => !c.match(/^(js-|is-|has-|active|hover|focus|disabled)/))
      .slice(0, 3);

    if (classes.length > 0) {
      selector += classes.map(c => `.${CSS.escape(c)}`).join('');
    }

    // Check uniqueness among siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        s => s.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        // Classes might make it unique
        const fullSelector = selector;
        const matchingSiblings = Array.from(parent.children).filter(s => {
          try {
            return s.matches(fullSelector);
          } catch {
            return false;
          }
        });
        if (matchingSiblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
    }

    path.unshift(selector);
    current = current.parentElement;

    // Check if current path is already unique
    const fullPath = path.join(' > ');
    try {
      if (document.querySelectorAll(fullPath).length === 1) {
        return fullPath;
      }
    } catch {
      // continue building path
    }
  }

  return path.join(' > ');
}

// --- XPath Generator ---

function generateXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`//${part}[@id="${current.id}"]`);
      return parts.join('/');
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        s => s.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `[${index}]`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return '/' + parts.join('/');
}

// --- Helpers ---

function getTextContent(el: Element): string | null {
  const text = el.textContent?.trim().slice(0, 100) ?? '';
  return text.length > 0 ? text : null;
}

function getSiblingIndex(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  return Array.from(parent.children).indexOf(el);
}

function isTextMatch(actual: string, expected: string): boolean {
  if (actual === expected) return true;

  // Short strings (< 4 chars): exact match only
  if (expected.length < 4) return false;

  // Longer strings: Levenshtein ratio < 0.2
  const distance = levenshteinDistance(actual, expected);
  const maxLen = Math.max(actual.length, expected.length);
  return maxLen > 0 && distance / maxLen < 0.2;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
