import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, memoriesTable, remindersTable } from "@workspace/db";
import {
  CreateMemoryBody,
  CreateMemoryResponse,
  DeleteMemoryParams,
  GetMemoryParams,
  GetMemoryResponse,
  ListMemoriesQueryParams,
  ListMemoriesResponse,
  UpdateMemoryBody,
  UpdateMemoryParams,
  UpdateMemoryResponse,
} from "@workspace/api-zod";
import {
  classifyMemory,
  extractMemoryData,
  extractReminder,
} from "../lib/memory";

const router: IRouter = Router();
const USER_ID = "local-user";

router.get("/memories", async (req, res): Promise<void> => {
  const parsed = ListMemoriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, limit } = parsed.data;
  const where = search?.trim()
    ? and(
        eq(memoriesTable.userId, USER_ID),
        or(
          ilike(memoriesTable.currentText, `%${search.trim()}%`),
          ilike(memoriesTable.originalText, `%${search.trim()}%`),
        ),
      )
    : eq(memoriesTable.userId, USER_ID);

  const memories = await db
    .select()
    .from(memoriesTable)
    .where(where)
    .orderBy(desc(memoriesTable.createdAt))
    .limit(limit);
  res.json(ListMemoriesResponse.parse(memories));
});

router.post("/memories", async (req, res): Promise<void> => {
  const parsed = CreateMemoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const text = parsed.data.text.trim();
  const category = parsed.data.category ?? classifyMemory(text);
  const extractedData = extractMemoryData(text);
  const [memory] = await db
    .insert(memoriesTable)
    .values({
      userId: USER_ID,
      originalText: text,
      currentText: text,
      category,
      extractedData,
    })
    .returning();

  const reminder = extractReminder(text);
  if (reminder && memory) {
    await db.insert(remindersTable).values({
      userId: USER_ID,
      memoryId: memory.id,
      reminderText: reminder.reminderText,
      remindAt: reminder.remindAt,
    });
  }

  res.status(201).json(CreateMemoryResponse.parse(memory));
});

router.get("/memories/:id", async (req, res): Promise<void> => {
  const params = GetMemoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [memory] = await db
    .select()
    .from(memoriesTable)
    .where(
      and(eq(memoriesTable.id, params.data.id), eq(memoriesTable.userId, USER_ID)),
    );
  if (!memory) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }
  res.json(GetMemoryResponse.parse(memory));
});

router.patch("/memories/:id", async (req, res): Promise<void> => {
  const params = UpdateMemoryParams.safeParse(req.params);
  const body = UpdateMemoryBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid memory update" });
    return;
  }
  const [memory] = await db
    .update(memoriesTable)
    .set({ currentText: body.data.currentText.trim(), updatedAt: new Date() })
    .where(
      and(eq(memoriesTable.id, params.data.id), eq(memoriesTable.userId, USER_ID)),
    )
    .returning();
  if (!memory) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }
  res.json(UpdateMemoryResponse.parse(memory));
});

router.delete("/memories/:id", async (req, res): Promise<void> => {
  const params = DeleteMemoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [memory] = await db
    .delete(memoriesTable)
    .where(
      and(eq(memoriesTable.id, params.data.id), eq(memoriesTable.userId, USER_ID)),
    )
    .returning();
  if (!memory) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;