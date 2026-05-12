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

export function FlowWizard() {
  const [tab, setTab] = useState<Tab>("template");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, startAiTransition] = useTransition();
  const [submitBusy, startSubmitTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null);

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

  const [aiStatus, setAiStatus] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    setAiStatus("Queuing job…");
    startAiTransition(async () => {
      const queued = await queueFlowGenerationAction(aiPrompt);
      if (!queued.ok) {
        setAiStatus(null);
        setError(queued.error);
        return;
      }
      setAiStatus("Waiting for daemon…");
      try {
        const result = await waitForJobResult(queued.data.id, {
          onStatus: (s, claimedBy) => {
            if (s === "claimed" || s === "running") {
              setAiStatus(`Daemon working${claimedBy ? ` (${claimedBy.slice(0, 8)})` : ""}…`);
            }
          },
        });
        const parsed = flowDraftSchema.safeParse(result);
        if (!parsed.success) {
          setError(
            `Daemon returned invalid output: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
          );
          setAiStatus(null);
          return;
        }
        setForm(draftToForm(parsed.data));
        setPickedTemplate(null);
        setAiStatus(null);
      } catch (e) {
        setError((e as Error).message);
        setAiStatus(null);
      }
    });
  }

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
        <TemplatePanel picked={pickedTemplate} onPick={handleTemplate} />
      ) : (
        <AiPanel
          prompt={aiPrompt}
          onPromptChange={setAiPrompt}
          busy={aiBusy}
          onGenerate={handleGenerate}
          status={aiStatus}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="flow_id"
          hint="lowercase, dotted segments. e.g. scheduling.create_job.dispatcher"
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

        <Field
          label="goal"
          hint="One sentence: what is the user trying to accomplish?"
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
          label="entry_route"
          hint="The URL path the agent starts from. Always begins with '/'."
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
          label="success_criteria"
          hint="One observable outcome per line. Avoid internal state — the agent can't see it."
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

        {error ? (
          <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-md p-3 text-sm">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitBusy}
            className="rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium px-4 py-2 disabled:opacity-50"
          >
            {submitBusy ? "Opening PR…" : "Open PR"}
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">
            We'll create a draft PR — nothing lands until a teammate reviews + merges.
          </p>
        </div>
      </form>
    </div>
  );
}
