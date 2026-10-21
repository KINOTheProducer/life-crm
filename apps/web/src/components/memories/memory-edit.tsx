"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteMemory } from "@/app/(app)/memories/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PickerPerson } from "@/components/people-picker";
import { MemoryForm, type MemoryFormValues } from "./memory-form";

/** Edit and delete controls; the form opens in place of the details. */
export function MemoryEdit({
  memoryId,
  values,
  people,
  today,
  children,
}: {
  memoryId: string;
  values: MemoryFormValues;
  people: PickerPerson[];
  today: string;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  if (editing) {
    return (
      <Card>
        <CardContent>
          <MemoryForm memoryId={memoryId} values={values} people={people} today={today} onDone={() => setEditing(false)} />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4">
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          Edit
        </Button>
        {confirming ? (
          <>
            <span className="text-sm text-muted-foreground">Delete this memory? Photos stay in Immich.</span>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={() => startDelete(() => deleteMemory(memoryId))}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
