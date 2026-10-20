"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { connectImmich, disconnectImmich } from "@/app/(app)/settings/immich-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/lib/submit";

export function ImmichForm({ connected }: { connected: { baseUrl: string; accountName: string | null } | null }) {
  const [state, action, pending] = useActionState(connectImmich, {});
  const [disconnecting, startDisconnect] = useTransition();
  const key = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.ok && key.current) key.current.value = "";
  }, [state.ok]);

  return (
    <div className="grid gap-5">
      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
          <span>
            Connected to <span className="font-medium">{connected.baseUrl}</span>
            {connected.accountName && <span className="text-muted-foreground"> as {connected.accountName}</span>}
          </span>
          <Button size="sm" variant="ghost" disabled={disconnecting} onClick={() => startDisconnect(() => disconnectImmich())}>
            Disconnect
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Attach photos from your Immich library to memories. Photos stay in Immich; we only keep which ones you picked.
        </p>
      )}
      <form onSubmit={submitKeepingValues(action)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Immich URL
            <Input name="baseUrl" type="url" required placeholder="http://192.168.1.10:2283" defaultValue={connected?.baseUrl ?? ""} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            API key
            <Input ref={key} name="apiKey" type="password" required autoComplete="off" placeholder={connected ? "Paste a new key to replace it" : ""} />
          </label>
        </div>
        <div className="grid gap-1 text-[13px] text-muted-foreground">
          <p>In Immich: Account settings, API keys, New API key. Tick these permissions:</p>
          <ul className="grid gap-0.5 pl-4">
            <li>
              <code className="font-mono text-foreground">asset.read</code>, <code className="font-mono text-foreground">asset.view</code> and{" "}
              <code className="font-mono text-foreground">person.read</code> (required)
            </li>
            <li>
              <code className="font-mono text-foreground">person.update</code> to name faces in Immich from here (optional)
            </li>
            <li>
              <code className="font-mono text-foreground">user.read</code> to show which account is connected (optional)
            </li>
          </ul>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-muted-foreground">Connected</p>}
        <Button type="submit" className="justify-self-start" disabled={pending}>
          {pending ? "Testing…" : connected ? "Update" : "Connect"}
        </Button>
      </form>
    </div>
  );
}
