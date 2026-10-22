import { AiError } from "@life-crm/ai";
import { withTenant } from "@life-crm/db";
import { z } from "zod";
import { answerQuestion, type AskResult } from "@/lib/data/assistant";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** One line of the response stream: a step along the way, then the answer or an error. */
export type AskEvent = { step: string } | { result: AskResult } | { error: string };

const question = z.object({ question: z.string().trim().min(3, "Ask a question first").max(500, "Keep it under 500 characters") });

/** Answer a question, streaming what it's doing as newline-delimited JSON so the page can say. */
export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = question.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Ask a question first" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await withTenant(db, user.tenantId, (tx) => answerQuestion(tx, user, parsed.data.question, (step) => send({ step })));
        send({ result });
      } catch (error) {
        if (!(error instanceof AiError)) console.error("Ask failed", error);
        send({ error: error instanceof AiError ? error.message : "Something went wrong. Please try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
