import { NextFunction, Request, Response } from "express";
import { type GatewayResponse } from "@memento/shared/types/gateway.ts";

export function errorHandler(
  err: any,
  _: Request,
  res: Response,
  __: NextFunction
): Response {
  const statusCode = err.statusCode || 500;

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred.";

  console.log("Error occurred while processing request:", message);

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