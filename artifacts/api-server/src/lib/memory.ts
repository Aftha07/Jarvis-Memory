import type { Memory } from "@workspace/db";

const categories = [
  "Meeting",
  "Person",
  "Company",
  "Requirement",
  "Follow-up",
  "Payment",
  "Expense",
  "Task",
  "Idea",
  "Personal",
  "General",
] as const;

const stopWords = new Set([
  "what",
  "when",
  "where",
  "who",
  "did",
  "does",
  "do",
  "tell",
  "told",
  "me",
  "you",
  "about",
  "the",
  "and",
  "for",
  "from",
  "with",
  "that",
  "this",
  "last",
  "week",
  "yesterday",
  "today",
  "please",
  "anyone",
  "somebody",
  "remember",
]);

export function classifyMemory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(remind|call|send|follow up|follow-up|todo|task)\b/.test(lower)) {
    return "Task";
  }
  if (/\b(paid|payment|sar|usd|\$|expense|spent|cost)\b/.test(lower)) {
    return /\b(paid|payment)\b/.test(lower) ? "Payment" : "Expense";
  }
  if (/\b(need|needs|required|operators|quotation|quote|request)\b/.test(lower)) {
    return "Requirement";
  }
  if (/\b(meet|met|meeting|discuss|visited)\b/.test(lower)) {
    return "Meeting";
  }
  if (/\b(company|inc\.|ltd\.|llc|corp|from abc)\b/.test(lower)) {
    return "Company";
  }
  if (/\b(idea|think we should|could build)\b/.test(lower)) {
    return "Idea";
  }
  return "General";
}

export function extractMemoryData(text: string): Record<string, unknown> {
  const lower = text.toLowerCase();
  const data: Record<string, unknown> = {};
  if (/\b(today|yesterday|tomorrow)\b/.test(lower)) {
    data.relativeDate = lower.match(/\b(today|yesterday|tomorrow)\b/)?.[1];
  }
  const operatorMatch = text.match(/\b(\d+)\s+operators?\b/i);
  if (operatorMatch) data.requirement = `${operatorMatch[1]} operators`;
  const reminderMatch = text.match(
    /remind me(?:\s+tomorrow(?:\s+at\s+[\w\s:]+)?|\s+at\s+[\w\s:]+)?\s+to\s+(.+)/i,
  );
  if (reminderMatch) {
    data.reminderText = reminderMatch[1].trim().replace(/[.!?]$/, "");
    data.reminderPending = true;
  }
  return data;
}

export function extractReminder(text: string): {
  reminderText: string;
  remindAt: Date | null;
} | null {
  const match = text.match(
    /remind me(?:\s+tomorrow(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?|\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\s+to\s+(.+)/i,
  );
  if (!match) return null;

  const hourText = match[1] ?? match[4];
  const minuteText = match[2] ?? match[5];
  const meridiem = (match[3] ?? match[6])?.toLowerCase();
  const task = (match[7] ?? "").trim().replace(/[.!?]$/, "");
  if (!task) return null;

  let remindAt: Date | null = null;
  if (hourText) {
    const date = new Date();
    if (/\btomorrow\b/i.test(match[0])) date.setDate(date.getDate() + 1);
    let hour = Number(hourText);
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    date.setHours(hour, Number(minuteText ?? 0), 0, 0);
    remindAt = date;
  }
  return { reminderText: task, remindAt };
}

export function isRepeatCommand(text: string): boolean {
  return /^(repeat|what did i just say|what did you save|show my last note)\s*[.!?]*$/i.test(
    text.trim(),
  );
}

export function isCorrection(text: string): boolean {
  return /^(no[, ]|change\b|actually\b|correction\b|correct that\b)/i.test(
    text.trim(),
  );
}

export function searchTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

export function scoreMemory(memory: Memory, terms: string[]): number {
  const haystack = `${memory.currentText} ${memory.originalText}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}