import type { RequestHandler } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface TokenVerifier {
  verify(token: string): Promise<{ username: string }>;
}

export function createCognitoVerifier(opts: {
  userPoolId: string;
  clientId: string;
}): TokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: opts.userPoolId,
    clientId: opts.clientId,
    tokenUse: "access",
  });
  return {
    async verify(token) {
      const payload = await verifier.verify(token);
      return { username: String(payload.username) };
    },
  };
}

// Write-route guard. With no verifier configured, requests run as user "dev"
// locally but are refused outright in production — a deployed API must never
// silently accept unauthenticated writes.
export function requireUser(opts: {
  verifier: TokenVerifier | null;
  isProduction: boolean;
}): RequestHandler {
  return async (req, res, next) => {
    if (!opts.verifier) {
      if (opts.isProduction) {
        res.status(401).json({ error: "auth is not configured" });
        return;
      }
      res.locals.username = "dev";
      next();
      return;
    }
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }
    try {
      const { username } = await opts.verifier.verify(token);
      res.locals.username = username;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
