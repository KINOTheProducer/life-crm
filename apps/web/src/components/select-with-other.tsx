"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/forms";

const other = "__other";

/** A dropdown of common choices plus "Something else", which swaps in a text field under the same name. */
export function SelectWithOther({
  name,
  label,
  options,
  defaultValue = "",
  placeholder,
  otherPlaceholder = "Type it in",
  maxLength,
  required,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: string;
  placeholder?: string;
  otherPlaceholder?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const preset = defaultValue === "" || options.includes(defaultValue);
  const [choice, setChoice] = useState(preset ? defaultValue : other);
  const [picked, setPicked] = useState(false);
  const typing = choice === other;

  return (
    <div className="grid gap-2">
      <select
        // Only one of the two fields carries the name, so the server reads a single value.
        name={typing ? undefined : name}
        aria-label={label}
        className={selectClass}
        value={choice}
        onChange={(e) => {
          setChoice(e.target.value);
          setPicked(true);
        }}
        required={required}
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={other}>Something else…</option>
      </select>
      {typing && (
        <Input
          name={name}
          aria-label={label}
          placeholder={otherPlaceholder}
          defaultValue={preset ? "" : defaultValue}
          maxLength={maxLength}
          required
          autoFocus={picked}
        />
      )}
    </div>
  );
}
