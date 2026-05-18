import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { personaYamlFileSchema, type Persona } from "@agiterra/rove-core";
import { z } from "zod";

const PERSONAS_FILE_SUFFIX = ".personas.yaml";

export interface LoadedCustomPersonas {
  personas: Persona[];
  errors: Array<{ file: string; message: string }>;
}

/**
 * Discover every `*.personas.yaml` file under flowsDir and return its
 * personas converted into the in-memory Persona shape. Validation is strict:
 * unknown fields error rather than silently drop, so an agent typoing
 * `promptAddendum` (camelCase) instead of `prompt_addendum` (the YAML key)
 * gets told. Per-file errors are returned alongside any successfully-parsed
 * personas — sync.ts surfaces them with the file path.
 */
export async function loadCustomPersonas(flowsDir: string): Promise<LoadedCustomPersonas> {
  let entries: string[];
  try {
    entries = await readdir(flowsDir);
  } catch {
    return { personas: [], errors: [] };
  }

  const files = entries.filter((n) => n.endsWith(PERSONAS_FILE_SUFFIX));
  const personas: Persona[] = [];
  const errors: LoadedCustomPersonas["errors"] = [];

  for (const name of files) {
    const filePath = join(flowsDir, name);
    let raw: unknown;
    try {
      const text = await readFile(filePath, "utf8");
      raw = parseYaml(text);
    } catch (err) {
      errors.push({
        file: filePath,
        message: `YAML parse failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const parsed = personaYamlFileSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ file: filePath, message: formatZodIssues(parsed.error) });
      continue;
    }

    for (const [id, entry] of Object.entries(parsed.data.personas)) {
      personas.push({
        id,
        label: entry.label,
        description: entry.description,
        category: entry.category,
        expertise: entry.expertise,
        icon: entry.icon,
        constraints: entry.constraints,
        promptAddendum: entry.prompt_addendum,
        isBuiltIn: false,
      });
    }
  }

  return { personas, errors };
}

function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "(root)";
      return `${path}: ${i.message}`;
    })
    .join("; ");
}
