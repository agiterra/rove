"use client";

import { useState, useTransition } from "react";
import type { FlowTemplate } from "../../../lib/authoring/templates";
import { flowDraftSchema, type FlowDraft } from "../../../lib/authoring/schemas";
import { waitForJobResult } from "../../../lib/authoring/wait-for-job";
import { queueFlowGenerationAction, submitFlowDraftAction, type ActionOutcome } from "./actions";
import {
  AiPanel,
  Field,
  TemplatePanel,
  Tabs,
  inputCls,
  textareaCls,
  type GenerateStage,
  type Tab,
} from "./flow-wizard-parts";

interface FormState {
  flow_id: string;
  goal: string;
  entry_route: string;
  success_criteria: string;
  template_id?: string;
}

const EMPTY_FORM: FormState = {
  flow_id: "",
  goal: "",
  entry_route: "",
  success_criteria: "",
  template_id: undefined,
};

function templateToForm(t: FlowTemplate): FormState {
  return {
    flow_id: t.draft.flow_id,
    goal: t.draft.goal,
    entry_route: t.draft.entry_route,
    success_criteria: t.draft.success_criteria.join("\n"),
    template_id: t.id,
  };
}

function draftToForm(d: FlowDraft): FormState {
  return {
    flow_id: d.flow_id,
    goal: d.goal,
    entry_route: d.entry_route,
    success_criteria: d.success_criteria.join("\n"),
    template_id: undefined,
  };
}

function formToDraft(f: FormState): FlowDraft {
  return {
    flow_id: f.flow_id.trim(),
    goal: f.goal.trim(),
    entry_route: f.entry_route.trim(),
    success_criteria: f.success_criteria
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    template_id: f.template_id,
  };
}

export function FlowWizard({
  daemonOnline: initialDaemonOnline,
  projectId,
}: {
  daemonOnline: boolean;
  projectId: string;
}) {
  // Live daemon-online state — the launcher polls and reports up here so
  // the moment the user runs `pnpm daemon`, Generate becomes enabled
  // without a page refresh.
  const [daemonOnline, setDaemonOnline] = useState<boolean>(initialDaemonOnline);
  // Default to the description path — a first-time user typing what they
  // want is the primary intent at /flows/new. Templates are the backup,
  // not the headline (per the dogfood change-review run that found
  // change.intent_mismatch on the template-default).
  const [tab, setTab] = useState<Tab>("ai");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, startAiTransition] = useTransition();
  const [submitBusy, startSubmitTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleTemplate(t: FlowTemplate) {
    setForm(templateToForm(t));
    setPickedTemplate(t.id);
    setError(null);
    setFieldErrors({});
  }

  function handleResult<T>(result: ActionOutcome<T>, onOk: (data: T) => void) {
    if (result.ok) {
      onOk(result.data);
    } else {
      setError(result.error);
      if ("fieldErrors" in result && result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    }
  }

  // Structured Generate progress: drives the GenerateProgress card so the
  // user sees something happening at every stage. A bare "Generating…"
  // toast is exactly the "did it fail?" UX that the dogfood walk caught.
  const [aiStage, setAiStage] = useState<GenerateStage>("idle");
  const [aiClaimedBy, setAiClaimedBy] = useState<string | null>(null);
  const [aiStartedAt, setAiStartedAt] = useState<number | null>(null);

  function resetAi() {
    setAiStage("idle");
    setAiClaimedBy(null);
    setAiStartedAt(null);
  }

  function handleGenerate() {
    setError(null);
    setAiStage("queuing");
    setAiClaimedBy(null);
    setAiStartedAt(Date.now());
    startAiTransition(async () => {
      const queued = await queueFlowGenerationAction(aiPrompt);
      if (!queued.ok) {
        resetAi();
        setError(queued.error);
        return;
      }
      setAiStage("waiting");
      try {
        const result = await waitForJobResult(queued.data.id, {
          onStatus: (s, claimedBy) => {
            if (s === "claimed" || s === "running") {
              setAiStage("working");
              if (claimedBy) setAiClaimedBy(claimedBy);
            }
          },
        });
        const parsed = flowDraftSchema.safeParse(result);
        if (!parsed.success) {
          setError(
            `Daemon returned invalid output: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
          );
          resetAi();
          return;
        }
        setForm(draftToForm(parsed.data));
        setPickedTemplate(null);
        setGenerated(true);
        resetAi();
      } catch (e) {
        setError((e as Error).message);
        resetAi();
      }
    });
  }

  function handlePick(t: FlowTemplate) {
    handleTemplate(t);
    setGenerated(false);
  }

  const formReady = pickedTemplate !== null || generated;

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const draft = formToDraft(form);
    startSubmitTransition(async () => {
      const result = await submitFlowDraftAction(draft);
      handleResult(result, (pr) => {
        window.location.href = pr.prUrl;
      });
    });
  }

  return (
    <div className="space-y-6">
      <Tabs tab={tab} onChange={setTab} />

      {tab === "template" ? (
        <TemplatePanel picked={pickedTemplate} onPick={handlePick} />
      ) : (
        <AiPanel
          prompt={aiPrompt}
          onPromptChange={setAiPrompt}
          busy={aiBusy}
          onGenerate={handleGenerate}
          onCancel={resetAi}
          stage={aiStage}
          claimedBy={aiClaimedBy}
          startedAt={aiStartedAt}
          daemonOnline={daemonOnline}
          onDaemonOnline={() => setDaemonOnline(true)}
          projectId={projectId}
        />
      )}

      {formReady ? (
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="eyebrow-lg pb-1">Review fields before opening PR</div>
          <Field
            label="What is the user trying to do?"
            schemaName="goal"
            hint="One sentence — the agent reads this as its mission."
            errors={fieldErrors.goal}
          >
            <textarea
              value={form.goal}
              onChange={(e) => update("goal", e.target.value)}
              placeholder="Create a PUMPING job for an existing property at a specific date/time"
              className={textareaCls}
              rows={2}
              required
            />
          </Field>

          <Field
            label="Where does the journey start?"
            schemaName="entry_route"
            hint="Just the URL path the agent navigates to first — like /admin/scheduling."
            errors={fieldErrors.entry_route}
          >
            <input
              value={form.entry_route}
              onChange={(e) => update("entry_route", e.target.value)}
              placeholder="/admin/scheduling"
              className={inputCls}
              required
            />
          </Field>

          <Field
            label="How would you know they succeeded?"
            schemaName="success_criteria"
            hint="One observable outcome per line. Things visible on screen — the agent can't see internal state."
            errors={fieldErrors.success_criteria}
          >
            <textarea
              value={form.success_criteria}
              onChange={(e) => update("success_criteria", e.target.value)}
              placeholder={
                "Submit button enables once required fields are valid\nToast confirms creation within 2s of submit"
              }
              className={textareaCls}
              rows={5}
              required
            />
          </Field>

          <Field
            label="Short stable name"
            schemaName="flow_id"
            hint="Lowercase, dotted segments. Used in URLs and reports. Pre-filled from your goal — edit if you like."
            errors={fieldErrors.flow_id}
          >
            <input
              value={form.flow_id}
              onChange={(e) => update("flow_id", e.target.value)}
              placeholder="scheduling.create_job.dispatcher"
              className={inputCls}
              required
            />
          </Field>

          {error ? (
            <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-md p-3 text-sm">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitBusy}
              className="rounded-md bg-[var(--color-accent)] text-[var(--color-bg)] font-semibold px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitBusy ? "Opening PR…" : "Open draft PR"}
            </button>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md">
              Creates a draft pull request with this flow's YAML. Nothing lands until a teammate
              reviews + merges.
            </p>
          </div>
        </form>
      ) : (
        <p className="text-xs text-[var(--color-text-faint)] italic pt-2">
          {tab === "ai"
            ? "Type a description above and click Generate to populate the form."
            : "Pick a template above to populate the form."}
        </p>
      )}
    </div>
  );
}
