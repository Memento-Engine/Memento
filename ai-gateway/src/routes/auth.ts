/**
 * Auth Routes
 * 
 * All authentication-related endpoints.
 * These are public routes (no auth middleware required).
 */

import express from "express";
import {
  googleLogin,
  googleCodeExchange,
  refreshTokens,
  logout,
  getSessions,
  revokeSession,
} from "@/controllers/googleAuth.ts";

const authRouter = express.Router();

// Google OAuth login (ID token flow - for web)
authRouter.post("/auth/google", googleLogin);

// Google OAuth code exchange (PKCE flow - for desktop apps)
authRouter.post("/auth/google/code", googleCodeExchange);

// Token refresh (with rotation)
authRouter.post("/auth/refresh", refreshTokens);

// Logout (requires auth)
authRouter.post("/auth/logout", logout);

// Get active sessions (requires auth)
authRouter.get("/auth/sessions", getSessions);

// Revoke specific session (requires auth)
authRouter.delete("/auth/sessions/:sessionId", revokeSession);

export default authRouter;
