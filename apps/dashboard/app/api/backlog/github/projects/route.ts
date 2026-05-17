/**
 * Lists the Project v2 boards on the given owner that the Rove GitHub
 * App can see. Used by the ProjectV2Picker dropdown in the connect-
 * existing and managed-board install forms so users don't have to
 * copy-paste URLs.
 *
 * Auth: team-gated (uses the cookie session; not a webhook). Reasoning:
 * this exposes a list of project titles and numbers which, while not
 * sensitive, is org-internal metadata. Match the rest of the dashboard's
 * read-side auth.
 */
import "server-only";
import { type NextRequest } from "next/server";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { getInstallationOctokit } from "@/lib/authoring/github-app";
import { listAccessibleProjectsV2 } from "@/lib/backlog/providers/github-graphql";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireTeamMember();
  } catch {
    return jsonResponse({ ok: false, error: "Not signed in." }, 401);
  }

  const owner = (request.nextUrl.searchParams.get("owner") ?? "").trim();
  const ownerTypeParam = request.nextUrl.searchParams.get("ownerType");
  const ownerType: "organization" | "user" =
    ownerTypeParam === "user" ? "user" : "organization";

  if (!owner || !/^[A-Za-z0-9_.-]+$/.test(owner)) {
    return jsonResponse({ ok: false, error: "owner query param required" }, 400);
  }

  try {
    const octokit = getInstallationOctokit();
    const projects = await listAccessibleProjectsV2(octokit, owner, ownerType);
    return jsonResponse({ ok: true, owner, projects }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
