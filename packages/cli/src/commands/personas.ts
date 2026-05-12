import { BUILT_IN_PERSONAS } from "@rove/core";

export function runPersonasCommand(): number {
  for (const p of BUILT_IN_PERSONAS) {
    console.log(`${p.id}\t${p.label}\t${p.category}/${p.expertise}`);
    console.log(`    ${p.description}`);
  }
  return 0;
}
