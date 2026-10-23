"use client";

import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { authEnabled, config } from "./config";

let configured = false;

export function configureAuth() {
  if (configured || !authEnabled) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: { email: true },
      },
    },
  });
  configured = true;
}

/**
 * The Cognito ID token is sent to API Gateway. It carries the email and
 * cognito:groups claims the API uses for permissions. Amplify refreshes it
 * automatically when it expires.
 */
export async function getIdToken(): Promise<string | undefined> {
  if (!authEnabled) return undefined;
  configureAuth();
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  } catch {
    return undefined;
  }
}
