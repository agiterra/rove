/**
 * Parser for Playwright MCP's YAML-like accessibility snapshot text.
 *
 * Example input (representative — real snapshots can be hundreds of lines):
 *
 *   - banner:
 *     - link "Runs" [ref=e1]: /runs
 *     - navigation [ref=e2]:
 *       - link "Findings" [ref=e3]
 *   - main:
 *     - heading "Walking the app" [level=1] [ref=e4]
 *     - button "Run walk" [ref=e7]
 *
 * Returns an AriaNode forest. Parser failures collapse into a single
 * raw-text node — we never throw, because partial snapshots are common.
 */

export interface AriaNode {
  /** Stable id within this tree (used for highlight targeting + keys). */
  id: string;
  /** "button" / "link" / "banner" / etc. "raw" for fallback text nodes. */
  role: string;
  /** Quoted accessible name when present. */
  name: string | null;
  /** The `[ref=eN]` value. */
  ref: string | null;
  /** Inline value after the trailing colon (e.g., href for links). */
  inlineValue: string | null;
  /** Bracketed attrs other than `ref`. */
  attributes: Record<string, string>;
  children: AriaNode[];
  /** Set for fallback nodes that hold the original raw text. */
  rawText?: string;
}

const LINE_RE = /^(\s*)-\s+(.+?)\s*$/;

export function parseAriaSnapshot(text: string | null | undefined): AriaNode[] {
  if (!text || typeof text !== "string") return [];

  try {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const root: AriaNode[] = [];
    const stack: Array<{ indent: number; container: AriaNode[] }> = [
      { indent: -1, container: root },
    ];
    let id = 0;

    for (const raw of lines) {
      const m = raw.match(LINE_RE);
      if (!m) continue;
      const indent = m[1].length;
      const body = m[2];

      const node = parseLine(body, `n${++id}`);

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      stack[stack.length - 1].container.push(node);
      stack.push({ indent, container: node.children });
    }

    if (root.length === 0) return rawFallback(text);
    return root;
  } catch {
    return rawFallback(text);
  }
}

function rawFallback(text: string): AriaNode[] {
  return [
    {
      id: "n1",
      role: "raw",
      name: null,
      ref: null,
      inlineValue: null,
      attributes: {},
      children: [],
      rawText: text,
    },
  ];
}

function parseLine(body: string, id: string): AriaNode {
  let rest = body;
  let inlineValue: string | null = null;

  // Split on the FIRST top-level colon (one not inside quotes / brackets).
  const colonIdx = findInlineColon(rest);
  if (colonIdx >= 0) {
    const after = rest.slice(colonIdx + 1).trim();
    rest = rest.slice(0, colonIdx).trim();
    if (after.length > 0) inlineValue = after;
  }

  // Pull off trailing bracket attributes (e.g. `[ref=e1] [level=1]`).
  const attributes: Record<string, string> = {};
  let ref: string | null = null;
  while (true) {
    const m = rest.match(/\[([^\]]+)\]\s*$/);
    if (!m) break;
    const inner = m[1].trim();
    const eq = inner.indexOf("=");
    if (eq >= 0) {
      const k = inner.slice(0, eq).trim();
      const v = inner.slice(eq + 1).trim();
      if (k === "ref") ref = v;
      else attributes[k] = v;
    } else {
      attributes[inner] = "true";
    }
    rest = rest.slice(0, rest.length - m[0].length).trim();
  }

  // Quoted accessible name + role.
  let role = rest;
  let name: string | null = null;
  const nm = rest.match(/^(\S+)\s+"((?:[^"\\]|\\.)*)"$/);
  if (nm) {
    role = nm[1];
    name = nm[2];
  }

  return {
    id,
    role: role.trim(),
    name,
    ref,
    inlineValue,
    attributes,
    children: [],
  };
}

/** Returns the index of the first top-level `:` not inside `"..."` or `[...]`. */
function findInlineColon(s: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== "\\") inQuote = !inQuote;
    else if (!inQuote && ch === "[") depth++;
    else if (!inQuote && ch === "]") depth = Math.max(0, depth - 1);
    else if (!inQuote && depth === 0 && ch === ":") return i;
  }
  return -1;
}
