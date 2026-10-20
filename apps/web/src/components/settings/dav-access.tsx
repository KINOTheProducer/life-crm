"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { createDavPassword, revokeDavPassword } from "@/app/(app)/settings/dav-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const when = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" });

export interface DavPasswordRow {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** App passwords for syncing contacts over CardDAV. */
export function DavAccess({ server, email, passwords }: { server: string; email: string; passwords: DavPasswordRow[] }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 text-sm">
      <p className="text-muted-foreground">
        Sync your people with the Contacts app on iPhone, Mac, Android (DAVx⁵) or Thunderbird. Edits go both ways; deleting on your phone moves them to the trash here.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">Server</dt>
        <dd className="font-mono text-[13px] break-all">{server}</dd>
        <dt className="text-muted-foreground">Username</dt>
        <dd className="font-mono text-[13px] break-all">{email}</dd>
        <dt className="text-muted-foreground">Password</dt>
        <dd>An app password from below</dd>
      </dl>

      {created && (
        <div className="grid gap-2 rounded-2xl bg-butter p-4">
          <p>
            Password for <span className="font-medium">{created.name}</span>. It won&apos;t be shown again.
          </p>
          <Input readOnly value={created.password} onFocus={(e) => e.currentTarget.select()} className="font-mono" />
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => navigator.clipboard.writeText(created.password)}>
            Copy
          </Button>
        </div>
      )}

      {passwords.length > 0 && (
        <ul className="divide-y divide-border">
          {passwords.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  Made {when.format(p.createdAt)} · {p.lastUsedAt ? `last synced ${when.format(p.lastUsedAt)}` : "not used yet"}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${p.name}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await revokeDavPassword(p.id);
                    if (created?.name === p.name) setCreated(null);
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await createDavPassword(name);
            if (res.error) setError(res.error);
            else {
              setCreated({ name: name.trim(), password: res.password! });
              setName("");
            }
          });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name, like iPhone" aria-label="Device name" maxLength={60} className="max-w-64" />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          Make app password
        </Button>
      </form>
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
