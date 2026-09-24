import type { Request, RequestHandler, Response } from "express";
import {
  SupabaseRequestError,
  supabaseAuthRequest,
  type SupabaseUser,
} from "./supabase";

const ACCESS_COOKIE = "jarvis_access";
const REFRESH_COOKIE = "jarvis_refresh";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: SupabaseUser;
};

export type AuthContext = {
  accessToken: string;
  user: SupabaseUser;
};

function getBearerToken(req: Request): string | null {
  const header = req.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getAccessToken(req: Request): string | null {
  return getBearerToken(req) ?? req.cookies?.[ACCESS_COOKIE] ?? null;
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure:
      req.secure ||
      req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
      process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api",
  };
}

export function setSessionCookies(
  req: Request,
  res: Response,
  session: SupabaseSession,
): void {
  const common = cookieOptions(req);
  const accessMaxAge = Math.max(60, session.expires_in ?? 3600) * 1000;
  res.cookie(ACCESS_COOKIE, session.access_token, {
    ...common,
    maxAge: accessMaxAge,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...common,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookies(req: Request, res: Response): void {
  const common = cookieOptions(req);
  res.clearCookie(ACCESS_COOKIE, common);
  res.clearCookie(REFRESH_COOKIE, common);
}

async function getSupabaseUser(accessToken: string): Promise<SupabaseUser> {
  const { data } = await supabaseAuthRequest<SupabaseUser>("/user", {
    accessToken,
  });
  if (!data?.id) throw new SupabaseRequestError("Invalid session", 401);
  return { id: data.id, email: data.email ?? null };
}

async function resolveAuthContext(
  req: Request,
  res: Response,
): Promise<AuthContext | null> {
  const accessToken = getAccessToken(req);
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  if (accessToken) {
    try {
      const user = await getSupabaseUser(accessToken);
      return { accessToken, user };
    } catch (error) {
      if (!(error instanceof SupabaseRequestError) || error.status >= 500) {
        throw error;
      }
    }
  }

  if (refreshToken && !getBearerToken(req)) {
    try {
      const { data } = await supabaseAuthRequest<SupabaseSession>(
        "/token?grant_type=refresh_token",
        { method: "POST", body: { refresh_token: refreshToken } },
      );
      if (!data?.access_token || !data?.refresh_token || !data?.user?.id) {
        throw new SupabaseRequestError("Invalid refresh session", 401);
      }
      setSessionCookies(req, res, data);
      return {
        accessToken: data.access_token,
        user: { id: data.user.id, email: data.user.email ?? null },
      };
    } catch (error) {
      if (!(error instanceof SupabaseRequestError) || error.status >= 500) {
        throw error;
      }
    }
  }

  if (accessToken || refreshToken) clearSessionCookies(req, res);
  return null;
}

export function setAuthContext(res: Response, context: AuthContext): void {
  (res.locals as { jarvisAuth?: AuthContext }).jarvisAuth = context;
}

export function getAuthContext(res: Response): AuthContext {
  const context = (res.locals as { jarvisAuth?: AuthContext }).jarvisAuth;
  if (!context) throw new Error("Authenticated request context is missing");
  return context;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const context = await resolveAuthContext(req, res);
    if (!context) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    setAuthContext(res, context);
    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to validate Supabase session");
    res.status(502).json({ error: "Authentication service is unavailable." });
  }
};

export async function getOptionalAuthContext(
  req: Request,
  res: Response,
): Promise<AuthContext | null> {
  const context = await resolveAuthContext(req, res);
  if (context) setAuthContext(res, context);
  return context;
}