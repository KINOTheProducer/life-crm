import type { DocumentExtraction, DocumentInput } from "./document";
import type { Extraction, ExtractionInput } from "./extraction";
import type { Resort, ResortInput } from "./resort";
import type { PartialExtraction } from "./progress";

export interface Extractor {
  readonly name: string;
  /** Pass `onPartial` to stream: it gets what the model has written so far, many times over. */
  extract(input: ExtractionInput, onPartial?: (partial: PartialExtraction) => void): Promise<Extraction>;
  /** Sort a file of notes about one person, and anyone else it mentions. */
  readDocument(input: DocumentInput): Promise<DocumentExtraction>;
  /** Suggest better homes for what's already saved about one person. */
  resort(input: ResortInput): Promise<Resort>;
}

export interface Transcriber {
  readonly name: string;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Em dashes never make it into anything we save or show: "Sarah — a nurse" becomes "Sarah, a nurse". */
export function noEmDashes(text: string): string {
  return text.replace(/\s*\u2014\s*/g, ", ").replace(/^, |, $/g, "");
}

/** `noEmDashes` on every string in a JSON-shaped value. */
export function stripEmDashes<T>(value: T): T {
  if (typeof value === "string") return noEmDashes(value) as T;
  if (Array.isArray(value)) return value.map(stripEmDashes) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripEmDashes(v)])) as T;
  return value;
}
