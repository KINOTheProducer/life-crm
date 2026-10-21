import { z } from "zod";
import { isValidPartialDate } from "./dates";

export const closenessTiers = ["inner", "close", "friend", "acquaintance"] as const;
export type ClosenessTier = (typeof closenessTiers)[number];

export const closenessLabels: Record<ClosenessTier, string> = {
  inner: "Inner circle",
  close: "Close",
  friend: "Friend",
  acquaintance: "Acquaintance",
};

/** Default keep-in-touch cadence per tier, in days. */
export const defaultCadenceDays: Record<ClosenessTier, number> = {
  inner: 7,
  close: 21,
  friend: 60,
  acquaintance: 180,
};

export const partialDateSchema = z
  .object({
    year: z.number().int().min(1800).max(2200).nullish(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  })
  .refine(isValidPartialDate, { message: "Invalid date" });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: optionalText(100),
  nickname: optionalText(100),
  pronouns: optionalText(50),
  closeness: z.enum(closenessTiers).default("friend"),
  birthday: partialDateSchema.nullish(),
  howMet: optionalText(2000),
});
export type ContactInput = z.infer<typeof contactInputSchema>;
