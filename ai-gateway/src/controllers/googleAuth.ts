/**
 * Google OAuth Authentication Controller
 * 
 * Handles:
 * - Google OAuth login initiation
 * - OAuth callback processing
 * - Session creation and management
 * - Token refresh with rotation
 * - Logout with session revocation
 */

import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "@/db/index.ts";
import { user, session, premiumCredits } from "@/db/schema.ts";
import { and, eq } from "drizzle-orm";
import { childLogger } from "@/utils/logger.ts";
import {
  BadRequestError,
  UnauthorizedError,
  InternalServerError,
} from "@memento/shared/errors.ts";
import type { GatewayResponse } from "@memento/shared/types/gateway.ts";
import { LOGGED_IN_PREMIUM_CREDITS } from "@/usageTracker.ts";

const log = childLogger("googleAuth");

// Token configuration
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// Types
interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  plan: "free" | "premium";
  type: "access";
}

interface GoogleTokenPayload {
  sub: string;       // Google subject ID (unique per user)
  email: string;
  name: string;
  picture?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiry;
}

function getClientIp(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;

    if (decoded.type !== "access") {
      throw new UnauthorizedError("Invalid token type");
    }

    return decoded;
  } catch (err) {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

async function requireActiveSession(decoded: AccessTokenPayload) {
  const [sessionRecord] = await db
    .select()
    .from(session)
    .where(
      and(
        eq(session.id, decoded.sessionId),
        eq(session.userId, decoded.userId),
      )
    )
    .limit(1);

  if (!sessionRecord || sessionRecord.revoked || !sessionRecord.refreshTokenHash) {
    throw new UnauthorizedError("Session expired or revoked");
  }

  await db
    .update(session)
    .set({ lastActiveAt: new Date() })
    .where(eq(session.id, sessionRecord.id));

  return sessionRecord;
}

// ============================================================================
// Google Login Initiation
// ============================================================================

/**
 * POST /auth/google
 * 
 * Body: { idToken: string, deviceInfo?: { os, hostname, appVersion } }
 * 
 * Verifies the Google ID token, creates/retrieves user, creates session,
 * and returns access + refresh tokens.
 */
export async function googleLogin(req: Request, res: Response): Promise<Response> {
  try {
    const { idToken, deviceInfo } = req.body;

    if (!idToken) {
      throw new BadRequestError("Missing Google ID token");
    }

    // Verify Google ID token using Google's tokeninfo endpoint
    let googlePayload: GoogleTokenPayload;
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );

      if (!response.ok) {
        throw new Error("Token verification failed");
      }

      const payload = await response.json() as {
        aud?: string;
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };

      // Verify the token was issued for our client
      if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new Error("Token audience mismatch");
      }

      if (!payload.sub || !payload.email || !payload.name) {
        throw new Error("Invalid token payload");
      }

      googlePayload = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };


      console.log("Google Payload", googlePayload);


    } catch (err) {
      log.warn({ err }, "Google ID token verification failed");
      throw new UnauthorizedError("Invalid Google ID token");
    }

    // Find or create user
    let dbUser = await db
      .select()
      .from(user)
      .where(eq(user.googleSubjectId, googlePayload.sub))
      .limit(1)
      .then(rows => rows[0]);

    if (!dbUser) {
      // Check if user exists by email (might have registered differently)
      const existingByEmail = await db
        .select()
        .from(user)
        .where(eq(user.email, googlePayload.email))
        .limit(1)
        .then(rows => rows[0]);

      if (existingByEmail) {
        // Link Google account to existing user
        await db
          .update(user)
          .set({
            googleSubjectId: googlePayload.sub,
            updatedAt: new Date(),
          })
          .where(eq(user.id, existingByEmail.id));
        dbUser = { ...existingByEmail, googleSubjectId: googlePayload.sub };
      } else {
        // Create new user
        const userId = crypto.randomUUID();
        await db.insert(user).values({
          id: userId,
          googleSubjectId: googlePayload.sub,
          name: googlePayload.name,
          email: googlePayload.email,
          plan: "free",
        });
        dbUser = {
          id: userId,
          googleSubjectId: googlePayload.sub,
          name: googlePayload.name,
          email: googlePayload.email,
          plan: "free" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Initialize premium credits for new user
        await db.insert(premiumCredits).values({
          userId: userId,
          totalCredits: LOGGED_IN_PREMIUM_CREDITS,
          usedCredits: 0,
          lastRefillAt: new Date(),
        });
        log.info({ userId, credits: LOGGED_IN_PREMIUM_CREDITS }, "Initialized credits for new user");
      }
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const refreshTokenExpiry = getRefreshTokenExpiry();

    await db.insert(session).values({
      id: sessionId,
      userId: dbUser.id,
      deviceOs: deviceInfo?.os,
      deviceHostname: deviceInfo?.hostname,
      appVersion: deviceInfo?.appVersion,
      ipAddress: getClientIp(req),
      refreshTokenHash,
      refreshTokenExpiresAt: refreshTokenExpiry,
    });

    // Generate access token
    const accessToken = generateAccessToken({
      userId: dbUser.id,
      sessionId,
      plan: dbUser.plan || "free",
      type: "access",
    });

    log.info({ userId: dbUser.id, sessionId }, "User logged in successfully");

    const response: GatewayResponse<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; name: string; email: string; plan: string; picture?: string };
    }> = {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          plan: dbUser.plan || "free",
          picture: googlePayload.picture,
        },
      },
    };

    return res.status(StatusCodes.OK).json(response);
  } catch (err) {
    log.error({ err }, "Google login failed");
    throw err;
  }
}

// ============================================================================
// Authorization Code Exchange (for Desktop Apps with PKCE)
// ============================================================================

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  scope: string;
  token_type: string;
  refresh_token?: string;
}

/**
 * POST /auth/google/code
 * 
 * Body: { code: string, codeVerifier: string, redirectUri: string, deviceInfo?: { os, hostname, appVersion } }
 * 
 * Exchanges authorization code for tokens using PKCE, then creates session.
 * This is the recommended flow for desktop/native apps.
 */
export async function googleCodeExchange(req: Request, res: Response): Promise<Response> {
  try {
    const { code, codeVerifier, redirectUri, deviceInfo } = req.body;

    if (!code || !codeVerifier || !redirectUri) {
      throw new BadRequestError("Missing required parameters: code, codeVerifier, or redirectUri");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      log.error("Google OAuth credentials not configured");
      throw new InternalServerError("OAuth not configured");
    }

    // Exchange authorization code for tokens
    log.info("Exchanging authorization code for tokens");

    let tokenResponse: GoogleTokenResponse;
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        log.warn({ status: response.status, body: errorBody }, "Token exchange failed");
        throw new Error("Token exchange failed");
      }

      tokenResponse = await response.json() as GoogleTokenResponse;
    } catch (err) {
      log.warn({ err }, "Failed to exchange authorization code");
      throw new UnauthorizedError("Failed to exchange authorization code");
    }

    // Verify the ID token to get user info
    let googlePayload: GoogleTokenPayload;
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenResponse.id_token)}`
      );

      if (!response.ok) {
        throw new Error("ID token verification failed");
      }

      const payload = await response.json() as {
        aud?: string;
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };

      if (payload.aud !== clientId) {
        throw new Error("Token audience mismatch");
      }

      if (!payload.sub || !payload.email || !payload.name) {
        throw new Error("Invalid token payload");
      }

      googlePayload = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (err) {
      log.warn({ err }, "ID token verification failed");
      throw new UnauthorizedError("Invalid ID token");
    }

    // Find or create user (same logic as googleLogin)
    let dbUser = await db
      .select()
      .from(user)
      .where(eq(user.googleSubjectId, googlePayload.sub))
      .limit(1)
      .then(rows => rows[0]);

    if (!dbUser) {
      const existingByEmail = await db
        .select()
        .from(user)
        .where(eq(user.email, googlePayload.email))
        .limit(1)
        .then(rows => rows[0]);

      if (existingByEmail) {
        await db
          .update(user)
          .set({
            googleSubjectId: googlePayload.sub,
            updatedAt: new Date(),
          })
          .where(eq(user.id, existingByEmail.id));
        dbUser = { ...existingByEmail, googleSubjectId: googlePayload.sub };
      } else {
        const userId = crypto.randomUUID();
        await db.insert(user).values({
          id: userId,
          googleSubjectId: googlePayload.sub,
          name: googlePayload.name,
          email: googlePayload.email,
          plan: "free",
        });
        dbUser = {
          id: userId,
          googleSubjectId: googlePayload.sub,
          name: googlePayload.name,
          email: googlePayload.email,
          plan: "free" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Initialize premium credits for new user
        await db.insert(premiumCredits).values({
          userId: userId,
          totalCredits: LOGGED_IN_PREMIUM_CREDITS,
          usedCredits: 0,
          lastRefillAt: new Date(),
        });
        log.info({ userId, credits: LOGGED_IN_PREMIUM_CREDITS }, "Initialized credits for new user");
      }
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const refreshTokenExpiry = getRefreshTokenExpiry();

    await db.insert(session).values({
      id: sessionId,
      userId: dbUser.id,
      deviceOs: deviceInfo?.os,
      deviceHostname: deviceInfo?.hostname,
      appVersion: deviceInfo?.appVersion,
      ipAddress: getClientIp(req),
      refreshTokenHash,
      refreshTokenExpiresAt: refreshTokenExpiry,
    });

    // Generate access token
    const accessToken = generateAccessToken({
      userId: dbUser.id,
      sessionId,
      plan: dbUser.plan || "free",
      type: "access",
    });

    log.info({ userId: dbUser.id, sessionId }, "User logged in via code exchange");

    const responseData: GatewayResponse<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; name: string; email: string; plan: string; picture?: string };
    }> = {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          plan: dbUser.plan || "free",
          picture: googlePayload.picture,
        },
      },
    };

    return res.status(StatusCodes.OK).json(responseData);
  } catch (err) {
    log.error({ err }, "Google code exchange failed");
    throw err;
  }
}

// ============================================================================
// Token Refresh with Rotation
// ============================================================================

/**
 * POST /auth/refresh
 * 
 * Body: { refreshToken: string }
 * 
 * Validates refresh token, rotates it (generates new one, invalidates old),
 * and returns new access + refresh tokens.
 */
export async function refreshTokens(req: Request, res: Response): Promise<Response> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new BadRequestError("Missing refresh token");
    }

    const tokenHash = hashRefreshToken(refreshToken);

    // Find session by refresh token hash
    const [sessionRecord] = await db
      .select()
      .from(session)
      .where(eq(session.refreshTokenHash, tokenHash))
      .limit(1);

    if (!sessionRecord) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    // Check if session is revoked
    if (sessionRecord.revoked) {
      throw new UnauthorizedError("Session has been revoked");
    }

    // Check if refresh token is expired
    if (sessionRecord.refreshTokenExpiresAt && new Date() > sessionRecord.refreshTokenExpiresAt) {
      throw new UnauthorizedError("Refresh token expired");
    }

    // Get user
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, sessionRecord.userId))
      .limit(1);

    if (!dbUser) {
      throw new UnauthorizedError("User not found");
    }

    // Rotate refresh token (generate new, invalidate old)
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    const newRefreshTokenExpiry = getRefreshTokenExpiry();

    await db
      .update(session)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        refreshTokenExpiresAt: newRefreshTokenExpiry,
        lastActiveAt: new Date(),
      })
      .where(eq(session.id, sessionRecord.id));

    // Generate new access token
    const accessToken = generateAccessToken({
      userId: dbUser.id,
      sessionId: sessionRecord.id,
      plan: dbUser.plan || "free",
      type: "access",
    });

    log.debug({ userId: dbUser.id, sessionId: sessionRecord.id }, "Tokens refreshed");

    const response: GatewayResponse<{
      accessToken: string;
      refreshToken: string;
    }> = {
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    };

    return res.status(StatusCodes.OK).json(response);
  } catch (err) {
    log.error({ err }, "Token refresh failed");
    throw err;
  }
}

// ============================================================================
// Logout with Session Revocation
// ============================================================================

/**
 * POST /auth/logout
 * 
 * Headers: Authorization: Bearer <accessToken>
 * 
 * Revokes the current session.
 */
export async function logout(req: Request, res: Response): Promise<Response> {
  try {
    const authHeader = req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = verifyAccessToken(token);
    await requireActiveSession(decoded);

    // Revoke session
    await db
      .update(session)
      .set({
        revoked: true,
        revokedAt: new Date(),
        refreshTokenHash: null,
      })
      .where(eq(session.id, decoded.sessionId));

    log.info({ userId: decoded.userId, sessionId: decoded.sessionId }, "User logged out");

    const response: GatewayResponse<{ message: string }> = {
      success: true,
      data: { message: "Logged out successfully" },
    };

    return res.status(StatusCodes.OK).json(response);
  } catch (err) {
    log.error({ err }, "Logout failed");
    throw err;
  }
}

// ============================================================================
// Get Active Sessions (for multi-device management)
// ============================================================================

/**
 * GET /auth/sessions
 * 
 * Headers: Authorization: Bearer <accessToken>
 * 
 * Returns list of active sessions for the current user.
 */
export async function getSessions(req: Request, res: Response): Promise<Response> {
  try {
    const authHeader = req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = verifyAccessToken(token);
    await requireActiveSession(decoded);

    // Get all active sessions for user
    const sessions = await db
      .select({
        id: session.id,
        deviceOs: session.deviceOs,
        deviceHostname: session.deviceHostname,
        appVersion: session.appVersion,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
      })
      .from(session)
      .where(
        and(
          eq(session.userId, decoded.userId),
          eq(session.revoked, false),
        )
      );

    const response: GatewayResponse<{ sessions: typeof sessions; currentSessionId: string }> = {
      success: true,
      data: {
        sessions,
        currentSessionId: decoded.sessionId,
      },
    };

    return res.status(StatusCodes.OK).json(response);
  } catch (err) {
    log.error({ err }, "Get sessions failed");
    throw err;
  }
}

// ============================================================================
// Revoke Specific Session
// ============================================================================

/**
 * DELETE /auth/sessions/:sessionId
 * 
 * Headers: Authorization: Bearer <accessToken>
 * 
 * Revokes a specific session (for remote logout).
 */
export async function revokeSession(req: Request, res: Response): Promise<Response> {
  try {
    const { sessionId: targetSessionId } = req.params;

    const authHeader = req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = verifyAccessToken(token);
    await requireActiveSession(decoded);

    // Ensure sessionId is a string
    const sessionIdToRevoke = Array.isArray(targetSessionId) ? targetSessionId[0] : targetSessionId;

    // Verify session belongs to user
    const [targetSession] = await db
      .select()
      .from(session)
      .where(eq(session.id, sessionIdToRevoke))
      .limit(1);

    if (!targetSession || targetSession.userId !== decoded.userId) {
      throw new UnauthorizedError("Session not found or not owned by user");
    }

    // Revoke session
    await db
      .update(session)
      .set({
        revoked: true,
        revokedAt: new Date(),
        refreshTokenHash: null,
      })
      .where(eq(session.id, sessionIdToRevoke));

    log.info({ userId: decoded.userId, revokedSessionId: targetSessionId }, "Session revoked");

    const response: GatewayResponse<{ message: string }> = {
      success: true,
      data: { message: "Session revoked successfully" },
    };

    return res.status(StatusCodes.OK).json(response);
  } catch (err) {
    log.error({ err }, "Revoke session failed");
    throw err;
  }
}
