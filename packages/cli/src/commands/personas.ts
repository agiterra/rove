import { BUILT_IN_PERSONAS } from "@agiterra/rove-core";
import { loadCustomPersonas } from "../personas/load-custom.js";
import type { ResolvedWorkspace } from "../workspace.js";

export async function runPersonasCommand(ws: ResolvedWorkspace): Promise<number> {
  console.log("# Built-in personas");
  for (const p of BUILT_IN_PERSONAS) {
    console.log(`${p.id}\t${p.label}\t${p.category}/${p.expertise}`);
    console.log(`    ${p.description}`);
  }

  const { personas: custom, errors } = await loadCustomPersonas(ws.flowsDir);
  if (custom.length > 0 || errors.length > 0) {
    console.log("");
    console.log(`# Custom personas (from ${ws.flowsDir}/*.personas.yaml)`);
  }
  for (const p of custom) {
    console.log(`${p.id}\t${p.label}\t${p.category}/${p.expertise}`);
    console.log(`    ${p.description}`);
  }
  for (const e of errors) {
    console.error(`✗ ${e.file}: ${e.message}`);
  }

  return errors.length > 0 ? 1 : 0;
}
