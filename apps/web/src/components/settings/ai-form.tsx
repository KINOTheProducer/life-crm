"use client";

import { useActionState, useState, useTransition } from "react";
import { saveAiSettings, testAi, type AiState } from "@/app/(app)/settings/ai-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

type Provider = "server" | "anthropic" | "openai_compatible" | "off";
type Stt = "server" | "openai_compatible" | "off";

export interface AiFormValues {
  provider: Provider;
  model: string;
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

export function AiSettingsForm({ values, server }: { values: AiFormValues; server: { ai: string; stt: string } }) {
  const [state, action, pending] = useActionState<AiState, FormData>(saveAiSettings, {});
  const [test, setTest] = useState<AiState | null>(null);
  const [testing, startTest] = useTransition();
  const [provider, setProvider] = useState<Provider>(values.provider);
  const [stt, setStt] = useState<Stt>(values.sttProvider);

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-6">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Reading voice notes and business cards</legend>
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
          <label className="grid gap-1.5 text-[13px] text-muted-foreground">
            Model
            <Input name="model" defaultValue={values.model} placeholder={provider === "anthropic" ? "Leave blank for the default" : "qwen2.5vl:7b"} required={provider === "openai_compatible"} />
          </label>
          <label className="grid gap-1.5 text-[13px] text-muted-foreground">
            API key
            <Input name="apiKey" type="password" autoComplete="off" placeholder={values.hasKey && values.provider === provider ? "Saved. Paste a new one to replace it" : provider === "anthropic" ? "sk-ant-…" : "If your server needs one"} />
          </label>
          {provider === "openai_compatible" && <p className="text-[13px] text-muted-foreground sm:col-span-2">Card scans need a model that can read images.</p>}
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
          <label className="grid gap-1.5 text-[13px] text-muted-foreground">
            Model
            <Input name="sttModel" defaultValue={values.sttModel} placeholder="Systran/faster-whisper-small" required />
          </label>
          <label className="grid gap-1.5 text-[13px] text-muted-foreground">
            API key
            <Input name="sttApiKey" type="password" autoComplete="off" placeholder={values.hasSttKey ? "Saved. Paste a new one to replace it" : "If needed"} />
          </label>
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
