import type { PartialDate } from "@life-crm/core";
import { Input } from "@/components/ui/input";
import { monthNames, selectClass } from "@/lib/forms";

/** Month, day and optional year inputs named `${prefix}Month`, `${prefix}Day`, `${prefix}Year`. Read with partialDateFrom(). */
export function PartialDateFields({
  prefix,
  label,
  defaultValue,
  yearPlaceholder = "Year (opt.)",
}: {
  prefix: string;
  label: string;
  defaultValue?: PartialDate | null;
  yearPlaceholder?: string;
}) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-2">
      <select name={`${prefix}Month`} aria-label={`${label} month`} className={selectClass} defaultValue={defaultValue?.month ?? ""}>
        <option value="">Month</option>
        {monthNames.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <Input name={`${prefix}Day`} type="number" min={1} max={31} placeholder="Day" aria-label={`${label} day`} defaultValue={defaultValue?.day ?? ""} />
      <Input
        name={`${prefix}Year`}
        type="number"
        min={1900}
        max={2100}
        placeholder={yearPlaceholder}
        aria-label={`${label} year`}
        defaultValue={defaultValue?.year ?? ""}
      />
    </div>
  );
}
