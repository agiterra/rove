import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

interface Body {
  access_token?: unknown;
  refresh_token?: unknown;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    return NextResponse.json(
      { error: "access_token and refresh_token are required" },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error || !data.session) {
    return NextResponse.json(
      { error: `failed to set session: ${error?.message ?? "missing session"}` },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true, user_id: data.user?.id ?? null }, { status: 200 });
}

function isAuthorized(request: Request): boolean {
  const secret = env.agentSessionSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
