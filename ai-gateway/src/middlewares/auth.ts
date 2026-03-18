import { NextFunction, Response } from "express";
import {
  UnauthorizedError,
  InternalServerError
} from "@memento/shared/errors.ts";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index.ts";
import { user, premiumCredits, session } from "@/db/schema.ts";
import { UserRole } from "@shared/types/gateway.ts";
import { RequestContext } from "@/types/request-context.ts";
import jwt from "jsonwebtoken";
import { UsageTracker, LOGGED_IN_PREMIUM_CREDITS } from "@/usageTracker.ts";
import { childLogger } from "@/utils/logger.ts";

const log = childLogger("auth");

// Initialize usage tracker for credit management
const usageTracker = new UsageTracker();

// Access token payload for authenticated users
export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  plan: "free" | "premium";
  type: "access";
}

const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;

    if (decoded.type !== "access") {
      throw new UnauthorizedError("Invalid token type");
    }

    return decoded;
  }
  catch (err) {
    log.error({ err }, "JWT verification failed");
    throw new UnauthorizedError("Invalid or expired access token");
  }
};

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

/**
 * Extract client IP address for anonymous rate limiting.
 * Handles proxied requests via X-Forwarded-For header.
 */
function getClientIp(req: RequestContext): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, first one is the client
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Middleware that handles both anonymous and authenticated requests.
 * 
 * ANONYMOUS FLOW:
 * - No Authorization header → mark as anonymous
 * - Rate limit by IP address only
 * - Route to free models
 * - No database lookups, no session tracking
 * 
 * AUTHENTICATED FLOW:
 * - Bearer token in Authorization header
 * - Verify JWT and session in database
 * - Route based on user plan (free/premium)
 */
export const validateUserRequest = async (
  req: RequestContext,
  _: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.header("authorization");
    
    // --- ANONYMOUS USER FLOW ---
    // No auth header = anonymous user, route to free models, rate limit by IP
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const clientIp = getClientIp(req);
      
      // Set up anonymous request context
      req.user = undefined;
      req.userRole = "anonymous" as UserRole;
      req.deviceId = clientIp; // Use IP as identifier for rate limiting
      req.availablePremiumCredits = 0; // Anonymous users get no premium credits
      
      log.debug({ clientIp }, "Anonymous request - routing to free models");
      return next();
    }

    // --- AUTHENTICATED USER FLOW ---
    const token = authHeader.replace("Bearer ", "");
    const decoded = verifyAccessToken(token);

    // Validate required claims
    if (!decoded.userId || !decoded.sessionId) {
      throw new UnauthorizedError("Invalid token claims");
    }

    await requireActiveSession(decoded);

    // Fetch user from database
    let users = [];
    try {
      users = await db
        .select()
        .from(user)
        .where(eq(user.id, decoded.userId))
        .limit(1);
    } catch (err: any) {
      log.error({ err }, "Database error while validating user");
      throw new InternalServerError("Database error while validating user");
    }

    if (!users.length) {
      throw new UnauthorizedError("User not found");
    }

    const dbUser = users[0];

    // Populate request context for authenticated user
    req.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
    };
    req.userRole = "logged" as UserRole;
    req.deviceId = decoded.sessionId; // Use sessionId for tracking

    // Get available premium credits for authenticated user
    try {
      const credits = await db
        .select()
        .from(premiumCredits)
        .where(eq(premiumCredits.userId, dbUser.id))
        .limit(1);

      if (credits.length) {
        req.availablePremiumCredits = Math.max(0, credits[0].totalCredits - credits[0].usedCredits);
      } else {
        // Initialize credits for new user
        await usageTracker.initializeCredits(decoded.sessionId, dbUser.id, "logged");
        req.availablePremiumCredits = LOGGED_IN_PREMIUM_CREDITS;
      }
    } catch (err) {
      log.error({ err }, "Database error while fetching user credits");
      req.availablePremiumCredits = 0;
    }

    log.debug({ userId: dbUser.id, plan: decoded.plan }, "Authenticated request");
    next();
  } catch (err) {
    next(err);
  }
};