export type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  picture?: string | null;
};

export type SupabaseAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: SupabaseAuthUser;
};

type AuthResponse<T> = T & {
  error?: string;
  error_code?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

function getAuthConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for authentication");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function authRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, key } = getAuthConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${url}/auth/v1/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as AuthResponse<T>;
  if (!response.ok) {
    throw new Error(
      payload.msg ||
        payload.message ||
        payload.error_description ||
        payload.error ||
        `Supabase Auth request failed (${response.status})`,
    );
  }
  return payload as T;
}

export function signUpWithPassword(
  email: string,
  password: string,
  metadata: Record<string, string>,
) {
  return authRequest<SupabaseAuthSession | { user: SupabaseAuthUser; session: null }>(
    "signup",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        data: metadata,
      }),
    },
  );
}

export function signInWithPassword(email: string, password: string) {
  return authRequest<SupabaseAuthSession>("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshSupabaseSession(refreshToken: string) {
  return authRequest<SupabaseAuthSession>(
    "token?grant_type=refresh_token",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
}

export function signOutSupabaseSession(accessToken: string) {
  return authRequest<void>("logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function toAuthUser(user: SupabaseAuthUser) {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    firstName:
      (metadata.first_name as string | undefined) ||
      (metadata.firstName as string | undefined) ||
      null,
    lastName:
      (metadata.last_name as string | undefined) ||
      (metadata.lastName as string | undefined) ||
      null,
    profileImageUrl: user.picture ?? (metadata.avatar_url as string | undefined) ?? null,
  };
}