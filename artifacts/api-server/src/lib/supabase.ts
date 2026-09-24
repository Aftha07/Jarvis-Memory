import { ReplitConnectors } from "@replit/connectors-sdk";

export type SupabaseUser = {
  id: string;
  email: string | null;
};

export type MemoryRecord = {
  id: string;
  originalText: string;
  currentText: string;
  category: string;
  extractedData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type SupabaseMemoryRow = {
  id: string;
  user_id: string;
  original_text: string;
  current_text: string;
  category: string | null;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SupabaseRequestError";
  }
}

const connectors = new ReplitConnectors();

async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ data: T; response: Response }> {
  const response = await connectors.proxy("supabase", path, {
    method: options.method ?? "GET",
    body: options.body,
    headers: {
      ...(options.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : {}),
      ...options.headers,
    },
  });
  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  if (!response.ok) {
    const details =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const message =
      (typeof details.message === "string" && details.message) ||
      (typeof details.error_description === "string" &&
        details.error_description) ||
      (typeof details.error === "string" && details.error) ||
      `Supabase request failed (${response.status})`;
    throw new SupabaseRequestError(message, response.status);
  }
  return { data: payload as T, response };
}

export function supabaseAuthRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string;
  } = {},
): Promise<{ data: T; response: Response }> {
  return requestJson<T>(`/auth/v1${path}`, options);
}

export function supabaseRestRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken: string;
    headers?: Record<string, string>;
  },
): Promise<{ data: T; response: Response }> {
  return requestJson<T>(`/rest/v1${path}`, options);
}

export function mapMemoryRow(row: SupabaseMemoryRow): MemoryRecord {
  return {
    id: row.id,
    originalText: row.original_text,
    currentText: row.current_text,
    category: row.category ?? "General",
    extractedData: row.extracted_data ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLikeValue(value: string): string {
  return value.replace(/[\\%"*"]/g, (character) => `\\${character}`);
}

export async function listUserMemories(
  userId: string,
  accessToken: string,
  limit: number,
  search?: string,
): Promise<MemoryRecord[]> {
  const params = new URLSearchParams({
    select: "*",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(search?.trim() ? 100 : limit),
  });
  if (search?.trim()) {
    const pattern = `"%${escapeLikeValue(search.trim())}%"`;
    params.set(
      "or",
      `(current_text.ilike.${pattern},original_text.ilike.${pattern})`,
    );
  }
  const { data } = await supabaseRestRequest<SupabaseMemoryRow[]>(
    `/memories?${params.toString()}`,
    { accessToken },
  );
  return data.map(mapMemoryRow);
}

export async function getUserMemory(
  id: string,
  userId: string,
  accessToken: string,
): Promise<MemoryRecord | null> {
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${id}`,
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const { data } = await supabaseRestRequest<SupabaseMemoryRow[]>(
    `/memories?${params.toString()}`,
    { accessToken },
  );
  return data[0] ? mapMemoryRow(data[0]) : null;
}

export async function createUserMemory(
  row: Omit<SupabaseMemoryRow, "id" | "created_at" | "updated_at">,
  accessToken: string,
): Promise<MemoryRecord> {
  const { data } = await supabaseRestRequest<SupabaseMemoryRow[]>(
    "/memories?select=*",
    {
      method: "POST",
      accessToken,
      headers: { Prefer: "return=representation" },
      body: row,
    },
  );
  if (!data[0]) throw new Error("Supabase did not return the created memory");
  return mapMemoryRow(data[0]);
}

export async function updateUserMemory(
  id: string,
  userId: string,
  accessToken: string,
  updates: Partial<Pick<SupabaseMemoryRow, "current_text" | "updated_at">>,
): Promise<MemoryRecord | null> {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${userId}`,
    select: "*",
  });
  const { data } = await supabaseRestRequest<SupabaseMemoryRow[]>(
    `/memories?${params.toString()}`,
    {
      method: "PATCH",
      accessToken,
      headers: { Prefer: "return=representation" },
      body: updates,
    },
  );
  return data[0] ? mapMemoryRow(data[0]) : null;
}

export async function deleteUserMemory(
  id: string,
  userId: string,
  accessToken: string,
): Promise<boolean> {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${userId}`,
  });
  const { response } = await supabaseRestRequest<null>(
    `/memories?${params.toString()}`,
    {
      method: "DELETE",
      accessToken,
      headers: { Prefer: "return=minimal" },
    },
  );
  return response.status === 204 || response.ok;
}

export async function createUserReminder(
  reminder: {
    user_id: string;
    memory_id: string;
    reminder_text: string;
    remind_at: string | null;
  },
  accessToken: string,
): Promise<void> {
  await supabaseRestRequest<unknown>("/reminders", {
    method: "POST",
    accessToken,
    headers: { Prefer: "return=minimal" },
    body: reminder,
  });
}

export async function getUserMemoryCount(
  userId: string,
  accessToken: string,
): Promise<number> {
  const params = new URLSearchParams({
    select: "id",
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const { response } = await supabaseRestRequest<SupabaseMemoryRow[]>(
    `/memories?${params.toString()}`,
    {
      method: "GET",
      accessToken,
      headers: { Prefer: "count=exact" },
    },
  );
  const contentRange = response.headers.get("content-range");
  const total = contentRange?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}