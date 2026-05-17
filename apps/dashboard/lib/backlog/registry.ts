/**
 * Adapter registry. Maps a `BacklogProvider` to its concrete adapter.
 * The dashboard-only adapter is built-in here; real providers live in
 * `./providers/<name>.ts` and are imported lazily so the dashboard's
 * client bundle never pulls them.
 */

import type { BacklogAdapter, BacklogProvider } from "./types";
import { DashboardOnlyAdapter } from "./providers/dashboard-only";

/**
 * Returns the adapter for a given provider. Throws when the provider
 * is unknown (caller is responsible for validating against the SQL
 * check constraint before reaching this).
 */
export async function getBacklogAdapter(provider: BacklogProvider): Promise<BacklogAdapter> {
  switch (provider) {
    case "dashboard-only":
      return new DashboardOnlyAdapter();
    case "github": {
      // Lazy import — keeps GH GraphQL client out of the default bundle.
      const { GitHubBacklogAdapter } = await import("./providers/github");
      return new GitHubBacklogAdapter();
    }
    case "linear": {
      const { LinearBacklogAdapter } = await import("./providers/linear");
      return new LinearBacklogAdapter();
    }
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown backlog provider: ${String(exhaustive)}`);
    }
  }
}
