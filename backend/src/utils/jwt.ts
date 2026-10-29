import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { IUserTokenPayload } from "../types/auth.types";

export function generateToken(
  payload: IUserTokenPayload,
  expiresIn: string | number = env.JWT_EXPIRES_IN
): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresIn as any,
  });
}

export function verifyToken(token: string): IUserTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as IUserTokenPayload;
}
