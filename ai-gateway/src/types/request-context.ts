// types/request-context.ts
import { UserRole, UserTier } from "@shared/types/gateway.ts";
import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
      };
      requestId: string;
      deviceId: string;
      userRole: UserRole,
      availablePremiumCredits: number;
    }
  }
}

export interface RequestContext extends Request {};