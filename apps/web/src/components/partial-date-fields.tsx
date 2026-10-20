"use client";

import { daysInMonth, type PartialDate } from "@life-crm/core";
import { useEffect, useRef, useState } from "react";
import { monthNames, selectClass } from "@/lib/forms";

const earliestYear = 1900;

/**
 * Month, day and optional year dropdowns named `${prefix}Month`, `${prefix}Day`, `${prefix}Year`.
 * Read with partialDateFrom(). Days follow the picked month, and years stop at this one unless `allowFuture`.
 */
export function PartialDateFields({
  prefix,
  label,
  defaultValue,
  yearPlaceholder = "Year (opt.)",
  allowFuture = false,
  onChange,
}: {
  prefix: string;
  label: string;
  defaultValue?: PartialDate | null;
  yearPlaceholder?: string;
  allowFuture?: boolean;
  /** Called with the date once month and day are both picked, otherwise null. */
  onChange?: (value: PartialDate | null) => void;
}) {
  const [initial] = useState(() => ({
    month: String(defaultValue?.month ?? ""),
    day: String(defaultValue?.day ?? ""),
    year: String(defaultValue?.year ?? ""),
  }));
  const [value, setValue] = useState(initial);
  const root = useRef<HTMLDivElement>(null);

  // form.reset() only resets uncontrolled fields, so follow it here.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const reset = () => setValue(initial);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initial]);

  const maxDay = value.month ? daysInMonth(value.year ? Number(value.year) : 2000, Number(value.month)) : 31;
  const thisYear = new Date().getFullYear();
  const lastYear = allowFuture ? thisYear + 10 : thisYear;
  const years = Array.from({ length: lastYear - earliestYear + 1 }, (_, i) => lastYear - i);

  function change(field: "month" | "day" | "year", v: string) {
    const next = { ...value, [field]: v };
    // Drop a day the new month or year doesn't have, like Feb 30.
    const max = next.month ? daysInMonth(next.year ? Number(next.year) : 2000, Number(next.month)) : 31;
    if (Number(next.day) > max) next.day = "";
    setValue(next);
    onChange?.(next.month && next.day ? { month: Number(next.month), day: Number(next.day), year: next.year ? Number(next.year) : null } : null);
  }

  const anySet = value.month !== "" || value.day !== "" || value.year !== "";

  return (
    <div ref={root} className="grid grid-cols-[2fr_1fr_1.2fr] gap-2">
      <select
        name={`${prefix}Month`}
        aria-label={`${label} month`}
        className={selectClass}
        value={value.month}
        onChange={(e) => change("month", e.target.value)}
        required={anySet}
      >
        <option value="">Month</option>
        {monthNames.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        name={`${prefix}Day`}
        aria-label={`${label} day`}
        className={selectClass}
        value={value.day}
        onChange={(e) => change("day", e.target.value)}
        required={anySet}
      >
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select name={`${prefix}Year`} aria-label={`${label} year`} className={selectClass} value={value.year} onChange={(e) => change("year", e.target.value)}>
        <option value="">{yearPlaceholder}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
