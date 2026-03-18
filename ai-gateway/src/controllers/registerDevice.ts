import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  UnauthorizedError,
} from "@memento/shared/errors.ts";

import crypto from "crypto";
import {
  RegisterDeviceResponse,
  registerDeviceSchema,
  type GatewayResponse,
} from "@memento/shared/types/gateway.ts";
import jwt from "jsonwebtoken";
import { fromError } from "zod-validation-error";
import { db } from "@/db/index.ts";
import { device, premiumCredits } from "@/db/schema.ts";
import { eq } from "drizzle-orm";
import { ANONYMOUS_PREMIUM_CREDITS } from "@/usageTracker.ts";
import { childLogger } from "@/utils/logger.ts";

const log = childLogger("registerDevice");

function generateAccessTokenUsingJwt({
  deviceId,
  os,
}: {
  deviceId: string;
  os: string;
}): string {
  return jwt.sign(
    {
      deviceId,
      os,
      type: "access",
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "1d" },
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}


export interface AccessTokenPayload {
  deviceId: string;
  userId?: string;
  os: string;
  type: "access";
}

export default async function registerDevice(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      const validationError = fromError(parsed.error).toString();

      throw new BadRequestError(validationError);
    }

    const { deviceId, signature, timestamp, deviceMetaData } = parsed.data;

    // 1. Ensure all parts exist
    if (!deviceId || !timestamp || !signature) {
      throw new BadRequestError(
        "Few Fields are missing. Make sure you are using the latest version of Memento AI",
      );
    }

    // 2. Prevent Replay Attacks (e.g., must be within 2 minutes)
    const currentTime = Math.floor(Date.now() / 1000); // Server Current Time in seconds
    const requestTime = parseInt(timestamp, 10);

    if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > 120) {
      log.warn({ requestTime, currentTime }, "Request rejected: Timestamp expired or invalid");
      throw new ForbiddenError(
        "Timestamp is invalid or request is too old. Please check your device time and try again.",
      );
    }

    // 3. Perform the Math (HMAC-SHA256)
    // This MUST match the b"MY_SUPER_SECRET_TAURI_KEY" from your Rust code
    const SECRET_KEY =
      process.env.TAURI_SECRET_KEY || "MY_SUPER_SECRET_TAURI_KEY";
    const messageToSign = `${deviceId}:${timestamp}`;

    log.info({ deviceId, os: deviceMetaData.os }, "Received device registration");

    const expectedSignature = crypto
      .createHmac("sha256", SECRET_KEY)
      .update(messageToSign)
      .digest("hex");

    // 4. Securely Compare the Signatures
    try {
      // Use timingSafeEqual instead of `===` to prevent timing attacks
      const clientBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (clientBuffer.length !== expectedBuffer.length) {
        throw new UnauthorizedError("Invalid signature length.");
      }

      if (!crypto.timingSafeEqual(clientBuffer, expectedBuffer)) {
        log.warn({ deviceId }, "Request rejected: Signature mismatch");
        throw new UnauthorizedError(
          "Invalid signature. Please ensure you are using the latest version of Memento AI.",
        );
      }
    } catch (error) {
      // Fails if the clientSignature is not a valid hex string
      throw new UnauthorizedError("Invalid signature format.");
    }



    // User Verified, We've to create an account for them (if not exists) and return JWT tokens
    const [existingDevice] = await db.select().from(device).where(eq(device.fingerprint, deviceId)).limit(1);


    let serverGeneratedDeviceId = existingDevice?.id;
    let isNewDevice = false;

    if (!existingDevice) {
      try {
        const inserted = await db.insert(device).values({
          id: crypto.randomUUID(),
          fingerprint: deviceId,
          os: deviceMetaData.os,
          hostname: deviceMetaData.machineHostName,
          appVersion: deviceMetaData.appVersion,
        }).returning({ id: device.id });
        serverGeneratedDeviceId = inserted[0]?.id;
        isNewDevice = true;
      }

      catch (err: any) {
        log.error({ err }, "Database error while registering device");
        throw new InternalServerError("Database error while registering device");
      }
    }

    // Initialize premium credits for new devices (anonymous users get 3 credits)
    if (isNewDevice && serverGeneratedDeviceId) {
      try {
        await db.insert(premiumCredits).values({
          deviceId: serverGeneratedDeviceId,
          totalCredits: ANONYMOUS_PREMIUM_CREDITS,
          usedCredits: 0,
          lastRefillAt: new Date(),
        });
        log.info({ deviceId: serverGeneratedDeviceId, credits: ANONYMOUS_PREMIUM_CREDITS }, "Initialized premium credits for new device");
      } catch (err: any) {
        log.error({ err }, "Failed to initialize premium credits");
        // Non-blocking: device registration should still succeed
      }
    }

    const accessTokenPayload: AccessTokenPayload = {
      deviceId: serverGeneratedDeviceId,
      os: deviceMetaData.os,
      type: "access",
    };
    const accessToken = generateAccessTokenUsingJwt(accessTokenPayload);
    const refreshToken = generateRefreshToken();

    const response: GatewayResponse<RegisterDeviceResponse> = {
      success: true,
      data: {
        accessToken,
        refreshToken,
        deviceId: serverGeneratedDeviceId!, // Return server-generated ID for client to use
      },
    };

    log.info({ deviceId: serverGeneratedDeviceId, os: deviceMetaData.os }, "Device registered successfully");

    return res.status(StatusCodes.OK).json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown gateway error";

    log.error({ message }, "Error during device registration");
    throw error;
  }
}
