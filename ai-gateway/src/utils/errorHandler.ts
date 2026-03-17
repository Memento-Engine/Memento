import { NextFunction, Request, Response } from "express";
import { type GatewayResponse } from "@memento/shared/types/gateway.ts";
import { childLogger } from "./logger.js";

const log = childLogger("errorHandler");

export function errorHandler(
  err: any,
  _: Request,
  res: Response,
  __: NextFunction
): Response {
  const statusCode = err.statusCode || 500;

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred.";

  log.error({ statusCode, err }, message);

  const errResponse: GatewayResponse<null> = {
    success: false,
    data: null,
    error: {
      code: statusCode,
      message,
    },
  };

  return res.status(statusCode).json(errResponse);
}