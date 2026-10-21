"use server";

import { AiError } from "@life-crm/ai";
import { z } from "zod";
import { answerQuestion, type AskResult } from "@/lib/data/assistant";
import { tenantQuery } from "@/lib/session";

export interface AskState {
  question?: string;
  result?: AskResult;
  error?: string;
}

export async function ask(_prev: AskState, form: FormData): Promise<AskState> {
  const question = z.string().trim().min(3, "Ask a question first").max(500, "Keep it under 500 characters").safeParse(form.get("question"));
  if (!question.success) return { error: question.error.issues[0]?.message };
  try {
    const result = await tenantQuery((tx, user) => answerQuestion(tx, user, question.data));
    return { question: question.data, result };
  } catch (error) {
    if (error instanceof AiError) return { question: question.data, error: error.message };
    throw error;
  }
}
