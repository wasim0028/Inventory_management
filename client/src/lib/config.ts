export const APP_NAME = "Stockroom";

export const config = {
  apiBaseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, ""),
  region: process.env.NEXT_PUBLIC_AWS_REGION ?? "ap-south-1",
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
  currency: process.env.NEXT_PUBLIC_CURRENCY || "INR",
  locale: process.env.NEXT_PUBLIC_LOCALE || "en-IN",
};

/** Without a Cognito pool configured the app runs in local mode (no sign-in). */
export const authEnabled = Boolean(config.userPoolId && config.userPoolClientId);
