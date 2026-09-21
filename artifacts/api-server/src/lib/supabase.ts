import { ReplitConnectors } from "@replit/connectors-sdk";

type SupabaseRequestInit = RequestInit & {
  json?: unknown;
  workspaceKey?: string;
};

export async function supabaseRequest<T>(
  path: string,
  init: SupabaseRequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.workspaceKey) {
    headers.set("x-career-workspace", init.workspaceKey);
  }

  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  const requestHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });
  const { json: _json, workspaceKey: _workspaceKey, ...proxyInit } = init;

  const response = await new ReplitConnectors().proxy(
    "supabase",
    `/rest/v1/${path.replace(/^\//, "")}`,
    {
      ...proxyInit,
      headers: requestHeaders,
      body,
    },
  );

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String(payload.message)
        : text || response.statusText;
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }

  return payload as T;
}

export async function supabaseAdminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/${path.replace(/^\/+/, "")}`,
    { ...init, headers },
  );
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `Supabase admin request failed (${response.status}): ${
        typeof payload === "object" && payload && "message" in payload
          ? payload.message
          : text || response.statusText
      }`,
    );
  }
  return payload as T;
}

export async function supabaseList<T>(
  table: string,
  filters: Record<string, string>,
  select = "*",
  workspaceKey?: string,
) {
  const params = new URLSearchParams({ select, ...filters });
  return supabaseRequest<T[]>(`${table}?${params.toString()}`, { workspaceKey });
}

export async function supabaseInsert<T>(
  table: string,
  rows: unknown | unknown[],
  workspaceKey?: string,
) {
  return supabaseRequest<T[]>(table, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    json: rows,
    workspaceKey,
  });
}

export async function supabaseUpsert<T>(
  table: string,
  rows: unknown | unknown[],
  workspaceKey?: string,
) {
  return supabaseRequest<T[]>(`${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    json: rows,
    workspaceKey,
  });
}

export async function supabaseUpdate<T>(
  table: string,
  filters: Record<string, string>,
  values: unknown,
  workspaceKey?: string,
) {
  const params = new URLSearchParams(filters);
  return supabaseRequest<T[]>(`${table}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    json: values,
    workspaceKey,
  });
}