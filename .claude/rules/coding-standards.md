# Coding Standards

This codebase is developed primarily by AI agents. These standards optimize for agent edit accuracy and code maintainability.

## File size limits

| Type             | Soft target | Default cap | Hard ceiling |
| ---------------- | ----------- | ----------- | ------------ |
| Source files     | 150 lines   | 300 lines   | 450 lines    |
| React components | 100 lines   | 250 lines   | 350 lines    |
| Test files       | 200 lines   | 400 lines   | 600 lines    |

- Most files should land in the **100–220 line range**.
- The 300-line cap is a default, not a universal law — accept exceptions when splitting reduces clarity. Document the exception in a comment at the top of the file.

## When you cross 300 lines

1. Make the requested change.
2. Decide: is this file a real split candidate or a cohesive whole that just happens to be long?
3. If splittable AND the change adds 20+ lines AND a natural seam exists, extract a sibling file in the same commit.
4. If cohesive, add a comment at the top explaining why it's allowed to be long.

## Splitting patterns

```
# Component
BigComponent.tsx            → BigComponent.tsx       (main render + state)
                              BigComponent.parts.tsx (sub-components)
                              BigComponent.utils.ts  (helpers)
                              BigComponent.types.ts  (interfaces)

# Service / handler
big-handler.ts              → big-handler.ts         (orchestration)
                              big-handler-foo.ts     (one operation per file)
```

## Exports

- One primary export per file (default or named — be consistent within a directory).
- Barrel files (`index.ts`) only when there's a real ergonomic win. Cap at 6 re-exports.
- Type-only exports use `export type` so bundlers can drop them.

## Naming

- **Components** — `PascalCase.tsx`
- **Hooks** — `use-kebab-case.ts` (filename), `useFooBar` (export)
- **Utils + non-component modules** — `kebab-case.ts`
- **Next App Router pages + layouts** — Next's convention (`page.tsx`, `layout.tsx`, `route.ts`)
- **Test files** — match the file under test: `foo.ts` → `foo.test.ts`, beside it

## Comments

- Default: write no comments. The code should read for itself.
- Add a comment when the **why** is non-obvious: a hidden constraint, a framework workaround, a deliberate departure from convention.
- Don't comment the **what** — naming + types do that.
- Don't leave dead "// TODO" without an issue link.

## Imports

- Absolute imports via TS path aliases where useful. Relative imports for siblings.
- Always import types with `import type` when only used in type position. The TS compiler strips them and bundle size drops.

## Tests

- Vitest in `packages/*`, Vitest or Playwright in `apps/*` depending on target.
- Co-locate (`foo.test.ts` next to `foo.ts`) unless the test fixture is large enough to warrant its own dir.
- One behavior per `test()`. Use `describe()` to group related behaviors.
