export const steps = ["you", "relationship", "partners", "family", "people", "reminders"] as const;
export type Step = (typeof steps)[number];

export const stepTitles: Record<Step, string> = {
  you: "You",
  relationship: "Relationship",
  partners: "Partner",
  family: "Family",
  people: "Your people",
  reminders: "Reminders",
};

export function parseStep(value: unknown): Step {
  return steps.find((s) => s === value) ?? "you";
}

/** The partner step only applies to people who said they're seeing someone. */
export function nextStep(from: Step, opts: { partnered?: boolean } = {}): Step {
  if (from === "relationship" && opts.partnered === false) return "family";
  const i = steps.indexOf(from);
  return steps[Math.min(i + 1, steps.length - 1)]!;
}
