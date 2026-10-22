import type { Extraction, ExtractionInput } from "./extraction";
import type { PartialExtraction } from "./progress";

export interface Extractor {
  readonly name: string;
  /** Pass `onPartial` to stream: it gets what the model has written so far, many times over. */
  extract(input: ExtractionInput, onPartial?: (partial: PartialExtraction) => void): Promise<Extraction>;
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
