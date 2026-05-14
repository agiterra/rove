/**
 * Given a parsed aria-snapshot tree + the action target of the current
 * step, return the id of the node that should render with
 * `.lw-tree-highlight`. Match strategy, in order:
 *
 *   1. Exact `[ref=...]` match against `actionTarget.target`.
 *   2. Case-insensitive accessible-name match against `actionTarget.element`.
 *
 * Returns null when nothing matches (or no actionTarget). Callers should
 * render the tree without a highlight in that case.
 */

import type { AriaNode } from "./parseAriaSnapshot";
import type { ActionTarget } from "./types";

export function highlightAriaTarget(
  nodes: AriaNode[],
  actionTarget: ActionTarget | null,
): string | null {
  if (!actionTarget) return null;

  if (actionTarget.target) {
    const byRef = findByRef(nodes, actionTarget.target);
    if (byRef) return byRef.id;
  }
  if (actionTarget.element) {
    const byName = findByElement(nodes, actionTarget.element);
    if (byName) return byName.id;
  }
  return null;
}

function findByRef(nodes: AriaNode[], ref: string): AriaNode | null {
  for (const n of nodes) {
    if (n.ref === ref) return n;
    const hit = findByRef(n.children, ref);
    if (hit) return hit;
  }
  return null;
}

function findByElement(nodes: AriaNode[], hint: string): AriaNode | null {
  const lo = hint.toLowerCase();
  for (const n of nodes) {
    if (n.name && lo.includes(n.name.toLowerCase())) return n;
    const hit = findByElement(n.children, hint);
    if (hit) return hit;
  }
  return null;
}
