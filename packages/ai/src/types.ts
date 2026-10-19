import type { Extraction, ExtractionInput } from "./extraction";

export interface Extractor {
  readonly name: string;
  extract(input: ExtractionInput): Promise<Extraction>;
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
