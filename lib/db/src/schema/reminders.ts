import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const remindersTable = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().default("local-user"),
  memoryId: uuid("memory_id"),
  reminderText: text("reminder_text").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertReminderSchema = createInsertSchema(remindersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof remindersTable.$inferSelect;