import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => Promise<{ requiresEmailConfirmation?: boolean }>;
  logout: () => void;
}

function getBasePath(): string {
  const path = new URL(document.baseURI).pathname.replace(/\/+$/, "");
  return path ? `${path}/` : "/";
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(() => {
    setIsLoading(true);
    let cancelled = false;
    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadUser(), [loadUser]);

  const login = useCallback(() => {
    window.location.href = `${getBasePath()}auth?mode=signin`;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/signin", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "Unable to sign in.");
    await loadUser();
  }, [loadUser]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    firstName = "",
    lastName = "",
  ) => {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      requiresEmailConfirmation?: boolean;
    };
    if (!response.ok && response.status !== 202) {
      throw new Error(data.error || "Unable to create your account.");
    }
    if (!data.requiresEmailConfirmation) await loadUser();
    return data;
  }, [loadUser]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    window.location.href = getBasePath();
  }, []);

  return { user, isLoading, isAuthenticated: !!user, login, signIn, signUp, logout };
}