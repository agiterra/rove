/**
 * Public type-level exports for consumers of @rove/cli. The actual CLI
 * lives at ./cli.ts and is wired to the `rove` bin script.
 */
export {
  loadRoveConfig,
  roveConfigSchema,
  SINK_IDS,
  type LoadedConfig,
  type RoveConfig,
  type SinkId,
} from "./config.js";
