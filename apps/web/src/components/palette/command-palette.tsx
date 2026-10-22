"use client";

import {
  Bell,
  CornerDownLeft,
  Home,
  IdCard,
  Images,
  MessageCircleQuestion,
  Mic,
  Network,
  NotebookText,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { quickAdd, searchPeople, type QuickAddState } from "@/app/(app)/palette-actions";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avatarSrc } from "@/lib/immich-urls";
import { nameInputProps, textareaClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  person?: { id: string; name: string; avatarRef: string | null };
  /** Where it goes, or "quick-add" to open the quick add form. */
  to: string;
}

/** Typing in a field shouldn't trigger shortcuts. */
function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function CommandPalette() {
  const router = useRouter();
  const palette = useRef<HTMLDialogElement>(null);
  const adder = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Awaited<ReturnType<typeof searchPeople>>>([]);
  const [active, setActive] = useState(0);
  const [, startSearch] = useTransition();
  // Remount the quick-add form each time so it opens empty.
  const [adds, setAdds] = useState(0);

  const openPalette = () => {
    setQuery("");
    setPeople([]);
    setActive(0);
    palette.current?.showModal();
  };
  const openAdder = () => {
    palette.current?.close();
    setAdds((n) => n + 1);
    adder.current?.showModal();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (palette.current?.open) palette.current.close();
        else openPalette();
      } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e) && !palette.current?.open && !adder.current?.open) {
        e.preventDefault();
        openAdder();
      }
    };
    // The nav's search button opens it too.
    const onOpen = () => openPalette();
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(
      () =>
        startSearch(async () => {
          const res = await searchPeople(q);
          if (!cancelled) setPeople(res);
        }),
      150,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    if (c.to === "quick-add") return openAdder();
    palette.current?.close();
    router.push(c.to);
  };
  const actions: Command[] = [
    { id: "quick", label: "Quick add someone", hint: "N", icon: Zap, to: "quick-add" },
    { id: "new", label: "Add someone with details", icon: UserPlus, to: "/people/new" },
    { id: "voice", label: "Record a voice note", icon: Mic, to: "/capture/new" },
    { id: "card", label: "Scan a business card", icon: IdCard, to: "/capture/card" },
    { id: "memory", label: "New memory", icon: Plus, to: "/memories/new" },
    { id: "home", label: "Home", icon: Home, to: "/dashboard" },
    { id: "people", label: "People", icon: Users, to: "/people" },
    { id: "family", label: "Family tree", icon: Network, to: "/family" },
    { id: "memories", label: "Memories", icon: Images, to: "/memories" },
    { id: "reminders", label: "Reminders", icon: Bell, to: "/reminders" },
    { id: "ask", label: "Ask about your people", icon: MessageCircleQuestion, to: "/ask" },
    { id: "import", label: "Import contacts", icon: Upload, to: "/people/import" },
    { id: "trash", label: "Trash", icon: Trash2, to: "/people/trash" },
    { id: "settings", label: "Settings", icon: Settings, to: "/settings" },
  ];
  const q = query.trim().toLowerCase();
  // "who lives in Ottawa?" goes to Ask; anything long enough can.
  const question = /\?$|^(who|what|when|where|which|how|whose|does|did|is|are)\b/.test(q);
  const askCommand: Command | null =
    q.split(/\s+/).length >= 2 ? { id: "ask-q", label: `Ask: ${query.trim()}`, icon: MessageCircleQuestion, to: `/ask?q=${encodeURIComponent(query.trim())}` } : null;
  const shown = q ? people : [];
  const brief: Command[] = shown[0] ? [{ id: `b:${shown[0].id}`, label: `Brief me on ${shown[0].name}`, icon: NotebookText, to: `/people/${shown[0].id}/brief` }] : [];
  const results: Command[] = [
    ...(question && askCommand ? [askCommand] : []),
    ...shown.map((p) => ({ id: `p:${p.id}`, label: p.name, hint: p.hint ?? undefined, person: p, to: `/people/${p.id}` })),
    ...brief,
    ...actions.filter((a) => !q || a.label.toLowerCase().includes(q)),
    ...(!question && askCommand ? [askCommand] : []),
  ];
  const selected = Math.min(active, Math.max(results.length - 1, 0));

  return (
    <>
      <dialog
        ref={palette}
        aria-label="Go to"
        onClick={(e) => e.target === palette.current && palette.current.close()}
        className="m-auto mt-[12vh] w-[min(640px,calc(100vw-2rem))] rounded-3xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        <div className="flex items-center gap-3 border-b border-border px-5">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(results[selected]);
              }
            }}
            placeholder="Find someone or do something…"
            aria-label="Find someone or do something"
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={results[selected] ? `cmd-${results[selected].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</li>}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <li
                key={r.id}
                id={`cmd-${r.id}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setActive(i)}
                onClick={() => run(r)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm", i === selected && "bg-secondary")}
              >
                {r.person ? (
                  <Avatar id={r.person.id} name={r.person.name} src={avatarSrc(r.person.avatarRef)} size={28} />
                ) : (
                  Icon && (
                    <span className="grid size-7 place-items-center rounded-full bg-secondary">
                      <Icon className="size-3.5" />
                    </span>
                  )
                )}
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                {r.hint && <span className="max-w-[45%] truncate text-[13px] text-muted-foreground">{r.hint}</span>}
                {i === selected && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </li>
            );
          })}
        </ul>
      </dialog>

      <dialog
        ref={adder}
        aria-label="Quick add"
        onClick={(e) => e.target === adder.current && adder.current.close()}
        className="m-auto mt-[12vh] w-[min(520px,calc(100vw-2rem))] rounded-3xl bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        <QuickAdd
          key={adds}
          onDone={(id) => {
            adder.current?.close();
            router.push(`/people/${id}`);
          }}
          onCancel={() => adder.current?.close()}
        />
      </dialog>
    </>
  );
}

function QuickAdd({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(async (prev: QuickAddState, form: FormData) => {
    const next = await quickAdd(prev, form);
    if (next.id) onDone(next.id);
    return next;
  }, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-3">
      <p className="type-display text-[1.75rem]">Quick add</p>
      <Input name="name" placeholder="Name" aria-label="Name" required maxLength={200} autoFocus {...nameInputProps} />
      <Input name="phone" type="tel" inputMode="tel" placeholder="Phone (optional)" aria-label="Phone" maxLength={40} />
      <textarea name="note" rows={3} maxLength={5000} placeholder="Anything to remember? Where you met, who they're with…" aria-label="Note" className={textareaClass} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
