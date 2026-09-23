import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, memoriesTable } from "@workspace/db";
import {
  GetMemorySummaryResponse,
  QueryAssistantBody,
  QueryAssistantResponse,
} from "@workspace/api-zod";
import {
  classifyMemory,
  extractMemoryData,
  isCorrection,
  isRepeatCommand,
  scoreMemory,
  searchTerms,
} from "../lib/memory";

const router: IRouter = Router();
const USER_ID = "local-user";

async function getMemories() {
  return db
    .select()
    .from(memoriesTable)
    .where(eq(memoriesTable.userId, USER_ID))
    .orderBy(desc(memoriesTable.createdAt))
    .limit(100);
}

router.post("/assistant/query", async (req, res): Promise<void> => {
  const parsed = QueryAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const message = parsed.data.message.trim();
  const memories = await getMemories();
  const latest = memories[0];

  if (isRepeatCommand(message)) {
    const response = {
      reply: latest
        ? latest.currentText
        : "I couldn't find anything about that in your memories.",
      action: latest ? "repeated" : "no_match",
      memory: latest ?? null,
    };
    res.json(QueryAssistantResponse.parse(response));
    return;
  }

  if (isCorrection(message) && latest) {
    const change = message
      .replace(/^(no[, ]*|change\b|actually\b|correction\b|correct that\b)/i, "")
      .trim()
      .replace(/^,/, "")
      .trim();
    const replacement = change.match(/^(.+?)\s+to\s+(.+)$/i);
    const currentText = replacement
      ? latest.currentText.replace(replacement[1], replacement[2])
      : change || latest.currentText;
    const [updated] = await db
      .update(memoriesTable)
      .set({ currentText, updatedAt: new Date() })
      .where(
        and(eq(memoriesTable.id, latest.id), eq(memoriesTable.userId, USER_ID)),
      )
      .returning();
    const response = {
      reply: updated ? `Updated. ${updated.currentText}` : "I couldn't update that memory.",
      action: updated ? "corrected" : "no_match",
      memory: updated ?? null,
    };
    res.json(QueryAssistantResponse.parse(response));
    return;
  }

  const terms = searchTerms(message);
  const ranked = memories
    .map((memory) => ({ memory, score: scoreMemory(memory, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.memory.createdAt.getTime() - a.memory.createdAt.getTime())
    .map(({ memory }) => memory)
    .slice(0, 5);
  const looksLikeQuestion =
    message.includes("?") ||
    /^(what|when|where|who|did|does|do|how|which|is|are)\b/i.test(message);

  if (looksLikeQuestion) {
    const response = ranked.length
      ? {
          reply: ranked.length === 1
            ? ranked[0].currentText
            : `I found ${ranked.length} memories that may help.`,
          action: "answered",
          memory: ranked[0],
          memories: ranked,
        }
      : {
          reply: "I couldn't find anything about that in your memories.",
          action: "no_match",
          memory: null,
          memories: [],
        };
    res.json(QueryAssistantResponse.parse(response));
    return;
  }

  const [memory] = await db
    .insert(memoriesTable)
    .values({
      userId: USER_ID,
      originalText: message,
      currentText: message,
      category: classifyMemory(message),
      extractedData: extractMemoryData(message),
    })
    .returning();
  const response = {
    reply: "Noted.",
    action: "saved",
    memory: memory ?? null,
  };
  res.json(QueryAssistantResponse.parse(response));
});

router.get("/assistant/summary", async (_req, res): Promise<void> => {
  const memories = await getMemories();
  const now = new Date();
  const today = memories.filter((memory) => {
    const date = memory.createdAt;
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }).length;
  const totalResult = await db
    .select({ id: memoriesTable.id })
    .from(memoriesTable)
    .where(eq(memoriesTable.userId, USER_ID));
  res.json(
    GetMemorySummaryResponse.parse({
      total: totalResult.length,
      today,
      latest: memories[0] ?? null,
    }),
  );
});

export default router;