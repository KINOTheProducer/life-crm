"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "unsupported" | "blocked" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function detect(publicKey: string | null): Promise<Status> {
  if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

/** Turn browser notifications on or off for this device. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detect(publicKey).then(setStatus);
  }, [publicKey]);

  async function enable() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error("save failed");
      setStatus("on");
    } catch {
      setError("Couldn't turn on notifications in this browser.");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setStatus("off");
  }

  return (
    <div className="grid gap-2 text-sm">
      {status === "unsupported" && (
        <p className="text-muted-foreground">
          {publicKey ? "This browser doesn't support notifications." : "Notifications aren't set up on this server yet (VAPID keys)."}
        </p>
      )}
      {status === "blocked" && <p className="text-muted-foreground">Notifications are blocked for this site in your browser settings.</p>}
      {status === "off" && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={enable}>
          Turn on for this browser
        </Button>
      )}
      {status === "on" && (
        <div className="flex items-center gap-3">
          <span>On for this browser.</span>
          <Button variant="ghost" size="sm" onClick={disable}>
            Turn off
          </Button>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
