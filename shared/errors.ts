import { StatusCodes, ReasonPhrases } from "http-status-codes";

class BaseError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: StatusCodes) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

export class BadRequestError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.BAD_REQUEST);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.UNAUTHORIZED);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.FORBIDDEN);
  }
}

export class JwtError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.UNAUTHORIZED);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.BAD_REQUEST);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.INTERNAL_SERVER_ERROR);
  }
}

export class InternalServerError extends BaseError {
  constructor(message: string) {
    super(message, StatusCodes.INTERNAL_SERVER_ERROR);
  }
}
