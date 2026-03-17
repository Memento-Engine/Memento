import { NextFunction, Response } from "express";
import {
  UnauthorizedError,
  InternalServerError
} from "@memento/shared/errors.ts";
import { eq, and } from "drizzle-orm";
import { db } from "src/db/index.ts";
import { user, device, premiumCredits } from "src/db/schema.ts";
import { UserRole, UserTier } from "@shared/types/gateway.ts";
import { RequestContext } from "src/types/request-context.ts";
import jwt from "jsonwebtoken";
import { AccessTokenPayload } from "src/controllers/registerDevice.ts";
import { UsageTracker, ANONYMOUS_PREMIUM_CREDITS, LOGGED_IN_PREMIUM_CREDITS } from "src/usageTracker.ts";
import { childLogger } from "src/utils/logger.js";

const log = childLogger("auth");

// Initialize usage tracker for credit management
const usageTracker = new UsageTracker();

const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;
    return decoded;
  }
  catch (err) {
    throw new UnauthorizedError("Invalid or expired access token");
  }
};

export const validateUserRequest = async (
  req: RequestContext,
  _: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // 1. Extract and validate headers
    const deviceId = req.header("x-device-id");
    if (!deviceId) {
      throw new UnauthorizedError("Missing device ID");
    }

    const authHeader = req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Access Token Header");
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = verifyAccessToken(token);

    // 2. Security Check: Prevent token reuse across different devices
    if (decoded.deviceId && decoded.deviceId !== deviceId) {
      throw new UnauthorizedError("Device ID mismatch. Token does not belong to this device.");
    }

    // Attach deviceId to the request context
    req.deviceId = deviceId;

    // 3. Branch logic based on Authentication State
    if (decoded.userId) {
      // --- STATE A: LOGGED IN USER ---
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

      // Populate RequestContext for a User
      req.user = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
      };
      req.userRole = 'logged';

      // Get available premium credits for logged-in user
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
          await usageTracker.initializeCredits(deviceId, dbUser.id, "logged");
          req.availablePremiumCredits = LOGGED_IN_PREMIUM_CREDITS;
        }
      } catch (err) {
        log.error({ err }, "Database error while fetching user credits");
        req.availablePremiumCredits = 0;
      }

    } else {
      // --- STATE B: ANONYMOUS DEVICE ---
      let devices = [];
      try {
        devices = await db
          .select()
          .from(device)
          .where(eq(device.id, deviceId))
          .limit(1);
      } catch (err: any) {
        log.error({ err }, "Database error while validating device");
        throw new InternalServerError("Database error while validating device");
      }

      if (!devices.length) {
        throw new UnauthorizedError("Unregistered device");
      }

      const dbDevice = devices[0];

      // Populate RequestContext for an Anonymous Device
      req.user = undefined;
      req.userRole = "anonymous" as UserRole;

      // Get available premium credits for anonymous device
      try {
        const credits = await db
          .select()
          .from(premiumCredits)
          .where(eq(premiumCredits.deviceId, deviceId))
          .limit(1);

        if (credits.length) {
          req.availablePremiumCredits = Math.max(0, credits[0].totalCredits - credits[0].usedCredits);
        } else {
          // Initialize credits for new device
          await usageTracker.initializeCredits(deviceId, undefined, "anonymous");
          req.availablePremiumCredits = ANONYMOUS_PREMIUM_CREDITS;
        }
      } catch (err) {
        log.error({ err }, "Database error while fetching device credits");
        req.availablePremiumCredits = 0;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};