import serverless from "serverless-http";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from "aws-lambda";
import type { Request } from "express";
import { createApp } from "./app.js";

// Created once per container and reused for warm invocations.
const app = createApp();

export const handler = serverless(app, {
  request(req: Request, event: APIGatewayProxyEventV2WithJWTAuthorizer, _context: Context) {
    // Gives requireAuth access to the claims the API Gateway JWT authorizer verified.
    req.lambdaEvent = event;
  },
});
