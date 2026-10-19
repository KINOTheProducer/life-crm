import "server-only";
import { extractorFromEnv, transcriberFromEnv, type Extractor, type Transcriber } from "@life-crm/ai";

let extractor: Extractor | undefined;
let transcriber: Transcriber | undefined;

export function getExtractor(): Extractor {
  return (extractor ??= extractorFromEnv());
}

export function getTranscriber(): Transcriber {
  return (transcriber ??= transcriberFromEnv());
}
