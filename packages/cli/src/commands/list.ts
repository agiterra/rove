import { discoverFlows } from "@tankloop/agentic-ux-evaluator-core";
import type { ResolvedWorkspace } from "../workspace.js";

export async function runListCommand(ws: ResolvedWorkspace): Promise<number> {
  const flows = await discoverFlows(ws.flowsDir);
  if (flows.length === 0) {
    console.error(`No flow files found in ${ws.flowsDir}`);
    console.error(`Expected files matching *.flow.yaml.`);
    return 1;
  }
  for (const flow of flows) {
    console.log(`${flow.flowId}\t${flow.goal}`);
  }
  return 0;
}
