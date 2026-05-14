"use server";

/**
 * Server action: create a new project row in public.projects.
 *
 * Validates slug shape (matches the daemon's PROJECT_SLUG_RE), checks for
 * collision, inserts via service-role (RLS would also allow it for team
 * members, but service-role keeps the insert symmetric with the other
 * authoring actions in this app).
 *
 * Redirects to /runs?p=<slug> on success.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { createServiceRoleSupabase } from "@/lib/supabase/server";

const PROJECT_COOKIE = "rove_project";
const PROJECT_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

const PROJECT_SLUG_RE = /^[a-z][a-z0-9-]*$/;

const InputSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(40)
    .regex(PROJECT_SLUG_RE, "lowercase letters/numbers/hyphens, must start with a letter"),
  display_name: z.string().min(1).max(80),
  default_target_url: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(z.url().optional()),
});

export type CreateProjectResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createProjectAction(formData: FormData): Promise<CreateProjectResult> {
  let me: Awaited<ReturnType<typeof requireTeamMember>>;
  try {
    me = await requireTeamMember();
  } catch {
    return { ok: false, error: "Not signed in" };
  }

  const raw = {
    id: String(formData.get("id") ?? "").trim(),
    display_name: String(formData.get("display_name") ?? "").trim(),
    default_target_url: String(formData.get("default_target_url") ?? "").trim() || undefined,
  };
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { id, display_name, default_target_url } = parsed.data;

  const supabase = createServiceRoleSupabase();

  // Collision check: a clear "already exists" beats a Postgres unique-violation
  // bubbled to the user.
  const { data: existing } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (existing) {
    return { ok: false, error: `Project '${id}' already exists` };
  }

  const { error } = await supabase.from("projects").insert({
    id,
    display_name,
    default_target_url: default_target_url ?? null,
    created_by: me.userId === "dev-bypass" ? null : me.userId,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  // Stamp the rove_project cookie so the TopBar's switcher picks up the
  // new active slug on the very next render (the cookie is the second
  // tier in resolveProjectId's URL → cookie → env precedence).
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, id, {
    path: "/",
    maxAge: PROJECT_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  redirect(`/runs?p=${encodeURIComponent(id)}`);
}
