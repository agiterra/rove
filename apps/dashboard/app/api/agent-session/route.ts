import "server-only";
import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type: string;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = env.agentSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "ROVE_AGENT_SESSION_USER_ID is not configured" },
      { status: 500 },
    );
  }

  const supabase = createServiceRoleSupabase();
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !userData.user?.email) {
    return NextResponse.json(
      { error: `walker user lookup failed: ${userErr?.message ?? "missing email"}` },
      { status: 500 },
    );
  }

  const { data: member, error: memberErr } = await supabase
    .from("team_members")
    .select("id, github_handle, display_name")
    .eq("supabase_user_id", userData.user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (memberErr) {
    return NextResponse.json(
      { error: `team member lookup failed: ${memberErr.message}` },
      { status: 500 },
    );
  }
  if (!member) {
    return NextResponse.json(
      { error: "configured walker user is not an active team member" },
      { status: 403 },
    );
  }

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json(
      { error: `magic link mint failed: ${linkErr?.message ?? "missing token hash"}` },
      { status: 500 },
    );
  }

  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyErr || !verifyData.session) {
    return NextResponse.json(
      { error: `session exchange failed: ${verifyErr?.message ?? "missing session"}` },
      { status: 500 },
    );
  }

  const session = verifyData.session as SupabaseSession;
  return NextResponse.json({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
    },
    user: {
      id: userData.user.id,
      email: userData.user.email,
      github_handle: member.github_handle,
      display_name: member.display_name,
    },
  });
}

function isAuthorized(request: Request): boolean {
  const secret = env.agentSessionSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
