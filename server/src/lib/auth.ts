import type { NextFunction, Request, Response } from "express";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { HttpError } from "./http.js";

export interface AuthUser {
  sub: string;
  email?: string;
  username?: string;
  groups: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      lambdaEvent?: APIGatewayProxyEventV2WithJWTAuthorizer;
    }
  }
}

type Claims = Record<string, unknown>;

function toUser(claims: Claims): AuthUser {
  let groups: string[] = [];
  const raw = claims["cognito:groups"];
  if (Array.isArray(raw)) groups = raw.map(String);
  else if (typeof raw === "string") {
    // API Gateway flattens arrays to "[admin staff]"
    groups = raw.replace(/^\[|\]$/g, "").split(/[ ,]+/).filter(Boolean);
  }
  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email) : undefined,
    username: claims["cognito:username"]
      ? String(claims["cognito:username"])
      : claims.username
        ? String(claims.username)
        : undefined,
    groups,
  };
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;
function getVerifier() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) return undefined;
  verifier ??= CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: null });
  return verifier;
}

/**
 * Behind API Gateway the JWT authorizer has already validated the Cognito token,
 * so we read its claims. When running locally we verify the token ourselves,
 * or skip auth entirely if AUTH_DISABLED=true.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const claims = req.lambdaEvent?.requestContext?.authorizer?.jwt?.claims;
    if (claims) {
      req.user = toUser(claims);
      return next();
    }

    if (process.env.AUTH_DISABLED === "true" && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      req.user = { sub: "local-dev", email: "dev@localhost", username: "dev", groups: ["admin"] };
      return next();
    }

    const v = getVerifier();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!v || !token) throw new HttpError(401, "Unauthorized");

    try {
      const payload = await v.verify(token);
      req.user = toUser(payload as Claims);
    } catch {
      throw new HttpError(401, "Unauthorized");
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireGroup(group: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.groups.includes(group)) {
      return next(new HttpError(403, `Only members of the "${group}" group can do this`));
    }
    next();
  };
}
