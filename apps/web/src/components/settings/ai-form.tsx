"use client";

import type { ModelOption } from "@life-crm/ai";
import { RefreshCw } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { pullModels, saveAiSettings, testAi, type AiState } from "@/app/(app)/settings/ai-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

type Provider = "server" | "anthropic" | "openai_compatible" | "off";
type Stt = "server" | "openai_compatible" | "off";

export interface AiFormValues {
  provider: Provider;
  model: string;
  chatModel: string;
  baseUrl: string;
  hasKey: boolean;
  sttProvider: Stt;
  sttBaseUrl: string;
  sttModel: string;
  hasSttKey: boolean;
}

function Choice<T extends string>({ name, value, current, onPick, title, detail }: { name: string; value: T; current: T; onPick: (v: T) => void; title: string; detail: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-3 hover:bg-muted", current === value && "border-foreground bg-secondary")}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} className="mt-1 size-4 accent-foreground" />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

const fieldClass =
  "h-9 w-full min-w-0 rounded-full border border-input bg-transparent px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A model name: free text until models are pulled, then a dropdown of what the provider has.
 * The saved value stays in the list even if the provider no longer offers it.
 */
function ModelField({
  name,
  label,
  defaultValue,
  models,
  placeholder,
  required,
  sameAs,
}: {
  name: string;
  label: string;
  defaultValue: string;
  models: ModelOption[] | null;
  placeholder?: string;
  required?: boolean;
  /** Offer a first "same as" option that saves blank. */
  sameAs?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [typing, setTyping] = useState(false);
  const list = models && !typing ? models : null;
  // A required field left blank shows the first model once there's a list to pick from.
  const shown = value || (required && list?.length ? list[0]!.id : "");
  return (
    <label className="grid gap-1.5 text-[13px] text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        {label}
        {models && (
          <button type="button" onClick={() => setTyping((t) => !t)} className="underline-offset-4 hover:text-foreground hover:underline">
            {typing ? "Pick from list" : "Type a name"}
          </button>
        )}
      </span>
      {list ? (
        <select name={name} value={shown} onChange={(e) => setValue(e.target.value)} required={required} className={fieldClass}>
          {sameAs !== undefined ? <option value="">{sameAs}</option> : !shown && <option value="">Default</option>}
          {shown && !list.some((m) => m.id === shown) && <option value={shown}>{shown} (saved)</option>}
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label === m.id ? m.id : `${m.label} (${m.id})`}
            </option>
          ))}
        </select>
      ) : (
        <Input name={name} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required={required} />
      )}
    </label>
  );
}

function PullButton({ onPull, pending }: { onPull: () => void; pending: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onPull} disabled={pending}>
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Pulling…" : "Pull available models"}
    </Button>
  );
}

export function AiSettingsForm({ values, server }: { values: AiFormValues; server: { ai: string; stt: string } }) {
  const [state, action, pending] = useActionState<AiState, FormData>(saveAiSettings, {});
  const [test, setTest] = useState<AiState | null>(null);
  const [testing, startTest] = useTransition();
  const [provider, setProvider] = useState<Provider>(values.provider);
  const [stt, setStt] = useState<Stt>(values.sttProvider);
  const form = useRef<HTMLFormElement>(null);
  // Pulled lists belong to the provider they came from; picking another clears them.
  const [aiModels, setAiModels] = useState<{ provider: Provider; models: ModelOption[] } | null>(null);
  const [sttModels, setSttModels] = useState<ModelOption[] | null>(null);
  const [pullError, setPullError] = useState<{ kind: "ai" | "stt"; message: string } | null>(null);
  const [pullingAi, startPullAi] = useTransition();
  const [pullingStt, startPullStt] = useTransition();

  const pull = (kind: "ai" | "stt") => {
    const data = new FormData(form.current!);
    const field = (n: string) => String(data.get(n) ?? "");
    const run = kind === "ai" ? startPullAi : startPullStt;
    run(async () => {
      setPullError(null);
      const res = await pullModels(
        kind === "ai"
          ? { kind, provider, baseUrl: field("baseUrl"), apiKey: field("apiKey") }
          : { kind, provider: "openai_compatible", baseUrl: field("sttBaseUrl"), apiKey: field("sttApiKey") },
      );
      if (res.error || !res.models) setPullError({ kind, message: res.error ?? "No models found" });
      else if (kind === "ai") setAiModels({ provider, models: res.models });
      else setSttModels(res.models);
    });
  };
  const pulled = aiModels?.provider === provider ? aiModels.models : null;

  return (
    <form ref={form} onSubmit={submitKeepingValues(action)} className="grid gap-6">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">AI for notes, cards, Ask and summaries</legend>
        <Choice name="provider" value="server" current={provider} onPick={setProvider} title="This server's setup" detail={server.ai} />
        <Choice name="provider" value="anthropic" current={provider} onPick={setProvider} title="Claude with my own key" detail="Your notes go to Anthropic under your account." />
        <Choice
          name="provider"
          value="openai_compatible"
          current={provider}
          onPick={setProvider}
          title="Another provider or a local model"
          detail="Anything with an OpenAI-style API: Ollama, LM Studio, vLLM, OpenAI, OpenRouter, Groq."
        />
        <Choice name="provider" value="off" current={provider} onPick={setProvider} title="Off" detail="Nothing leaves this server. Voice notes and card scans won't work." />
      </fieldset>

      {(provider === "anthropic" || provider === "openai_compatible") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {provider === "openai_compatible" && (
            <label className="grid gap-1.5 text-[13px] text-muted-foreground sm:col-span-2">
              Base URL
              <Input name="baseUrl" type="url" defaultValue={values.baseUrl} placeholder="http://192.168.1.10:11434/v1" required />
            </label>
          )}
          <label className="grid gap-1.5 text-[13px] text-muted-foreground sm:col-span-2">
            API key
            <Input name="apiKey" type="password" autoComplete="off" placeholder={values.hasKey && values.provider === provider ? "Saved. Paste a new one to replace it" : provider === "anthropic" ? "sk-ant-…" : "If your server needs one"} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <PullButton onPull={() => pull("ai")} pending={pullingAi} />
            {pulled && <span className="text-[13px] text-muted-foreground">{pulled.length} models</span>}
            {pullError?.kind === "ai" && <span className="text-[13px] text-destructive">{pullError.message}</span>}
          </div>
          <ModelField
            key={`model-${provider}`}
            name="model"
            label="Voice notes, cards and imports"
            defaultValue={values.provider === provider ? values.model : ""}
            models={pulled}
            placeholder={provider === "anthropic" ? "Leave blank for the default" : "qwen2.5vl:7b"}
            required={provider === "openai_compatible"}
          />
          <ModelField
            key={`chat-${provider}`}
            name="chatModel"
            label="Ask and summaries"
            defaultValue={values.provider === provider ? values.chatModel : ""}
            models={pulled}
            placeholder="Blank uses the same model"
            sameAs="Same as voice notes"
          />
          <p className="text-[13px] text-muted-foreground sm:col-span-2">
            A small, quick model is fine for reading notes{provider === "openai_compatible" && " (card scans need one that can read images)"}. Ask and summaries do better with a stronger one.
          </p>
        </div>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Speech to text</legend>
        <Choice name="sttProvider" value="server" current={stt} onPick={setStt} title="This server's setup" detail={server.stt} />
        <Choice
          name="sttProvider"
          value="openai_compatible"
          current={stt}
          onPick={setStt}
          title="My own"
          detail="Any /audio/transcriptions endpoint: a local Whisper (speaches), OpenAI, Groq."
        />
        <Choice name="sttProvider" value="off" current={stt} onPick={setStt} title="Off" detail="Voice notes are turned off." />
      </fieldset>
      {stt === "openai_compatible" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[13px] text-muted-foreground sm:col-span-2">
            Base URL
            <Input name="sttBaseUrl" type="url" defaultValue={values.sttBaseUrl} placeholder="http://192.168.1.10:8000/v1" required />
          </label>
          <label className="grid gap-1.5 text-[13px] text-muted-foreground sm:col-span-2">
            API key
            <Input name="sttApiKey" type="password" autoComplete="off" placeholder={values.hasSttKey ? "Saved. Paste a new one to replace it" : "If needed"} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <PullButton onPull={() => pull("stt")} pending={pullingStt} />
            {sttModels && <span className="text-[13px] text-muted-foreground">{sttModels.length} models</span>}
            {pullError?.kind === "stt" && <span className="text-[13px] text-destructive">{pullError.message}</span>}
          </div>
          <ModelField
            name="sttModel"
            label="Model"
            defaultValue={values.sttModel}
            models={sttModels}
            placeholder="Systran/faster-whisper-small"
            required
          />
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {test?.error && <p className="text-sm text-destructive">{test.error}</p>}
      {(test?.message || state.message) && !state.error && !test?.error && <p className="text-sm text-muted-foreground">{test?.message ?? state.message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={testing || provider === "off"}
          onClick={() =>
            startTest(async () => {
              setTest(null);
              setTest(await testAi());
            })
          }
        >
          {testing ? "Testing…" : "Test with a sample note"}
        </Button>
      </div>
      <p className="text-[13px] text-muted-foreground">Test uses what&apos;s saved, so save first if you changed anything.</p>
    </form>
  );
}
