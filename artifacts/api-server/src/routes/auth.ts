import { Router, type IRouter, type Request, type Response } from "express";
import {
  clearSession,
  createSession,
  deleteSession,
  getSessionId,
  getSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import {
  migrateWorkspace,
  getAnonymousWorkspaceKey,
  clearAnonymousWorkspaceCookie,
  upsertUser,
} from "../lib/career-store";
import {
  signInWithPassword,
  signOutSupabaseSession,
  signUpWithPassword,
  toAuthUser,
  type SupabaseAuthSession,
} from "../lib/supabase-auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function credentials(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== "object") return null;
  const { email, password } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    typeof password !== "string" ||
    password.length < 6
  ) {
    return null;
  }
  return { email: email.trim().toLowerCase(), password };
}

function sessionData(session: SupabaseAuthSession): SessionData {
  return {
    user: toAuthUser(session.user),
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
  };
}

async function createBrowserSession(
  req: Request,
  res: Response,
  session: SupabaseAuthSession,
) {
  await upsertUser(toAuthUser(session.user));
  const anonymousWorkspace = getAnonymousWorkspaceKey(req);
  if (anonymousWorkspace && anonymousWorkspace !== session.user.id) {
    await migrateWorkspace(anonymousWorkspace, session.user.id);
  }
  clearAnonymousWorkspaceCookie(res);
  setSessionCookie(res, await createSession(sessionData(session)));
}

router.get("/auth/user", (req, res) => {
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

router.post("/auth/signup", async (req, res, next) => {
  const input = credentials(req.body);
  if (!input) {
    res.status(400).json({
      error: "Use a valid email and a password with at least 6 characters.",
    });
    return;
  }
  try {
    const firstName =
      typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
    const lastName =
      typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";
    const result = await signUpWithPassword(input.email, input.password, {
      first_name: firstName,
      last_name: lastName,
    });
    if (!("access_token" in result) || !result.access_token) {
      res.status(202).json({
        requiresEmailConfirmation: true,
        message: "Check your email to confirm your account, then sign in.",
      });
      return;
    }
    await createBrowserSession(req, res, result);
    res.status(201).json({ user: toAuthUser(result.user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/signin", async (req, res, next) => {
  const input = credentials(req.body);
  if (!input) {
    res.status(400).json({
      error: "Use a valid email and a password with at least 6 characters.",
    });
    return;
  }
  try {
    const session = await signInWithPassword(input.email, input.password);
    await createBrowserSession(req, res, session);
    res.json({ user: toAuthUser(session.user) });
  } catch (error) {
    res.status(401).json({ error: "Email or password is incorrect." });
  }
});

router.post("/auth/refresh", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  res.json({ user: req.user });
});

router.post("/auth/signout", async (req, res, next) => {
  const sid = getSessionId(req);
  try {
    const session = sid ? await getSession(sid) : null;
    if (session?.access_token) {
      await signOutSupabaseSession(session.access_token).catch(() => undefined);
    }
    await clearSession(res, sid);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/mobile-auth/logout", async (req, res) => {
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  res.json({ success: true });
});

export default router;