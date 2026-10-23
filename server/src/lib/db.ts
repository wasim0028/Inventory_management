import { PrismaPg } from "@prisma/adapter-pg";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Connection string resolution, in order:
 *  1. DATABASE_URL (local development)
 *  2. DB_SECRET_ARN -> an RDS / Secrets Manager secret holding
 *     {"username": "...", "password": "...", "host"?: "...", "port"?: 5432, "dbname"?: "..."}
 *     combined with DB_HOST / DB_PORT / DB_NAME environment variables.
 *
 * The client is created once per Lambda container and reused across invocations.
 */
let clientPromise: Promise<PrismaClient> | undefined;

interface DbSecret {
  username: string;
  password: string;
  host?: string;
  port?: number | string;
  dbname?: string;
}

async function resolveConnectionString(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error("Set DATABASE_URL or DB_SECRET_ARN to configure the database");
  }

  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!res.SecretString) throw new Error("Database secret has no SecretString");
  const secret = JSON.parse(res.SecretString) as DbSecret;

  const host = process.env.DB_HOST ?? secret.host;
  const port = process.env.DB_PORT ?? secret.port ?? 5432;
  const dbname = process.env.DB_NAME ?? secret.dbname ?? "postgres";
  if (!host) throw new Error("DB_HOST is not set and the secret has no host");

  const user = encodeURIComponent(secret.username);
  const pass = encodeURIComponent(secret.password);
  return `postgresql://${user}:${pass}@${host}:${port}/${dbname}`;
}

async function createClient(): Promise<PrismaClient> {
  const connectionString = await resolveConnectionString();
  const useSsl = process.env.DB_SSL === "true";
  const adapter = new PrismaPg({
    connectionString,
    // Lambda handles one request at a time per container, so a tiny pool is enough
    // and keeps the total connection count on RDS low.
    max: Number(process.env.DB_POOL_MAX ?? (process.env.AWS_LAMBDA_FUNCTION_NAME ? 2 : 10)),
    idleTimeoutMillis: Number(process.env.DB_IDLE_MS ?? 60_000),
    // On Lambda, NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem makes the RDS CA trusted,
    // so certificates are fully verified.
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
  });
  return new PrismaClient({ adapter });
}

export function getDb(): Promise<PrismaClient> {
  if (!clientPromise) {
    clientPromise = createClient().catch((err) => {
      clientPromise = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Drops the cached client so the next request reads the secret again.
 * Called when the database rejects our password, which happens after RDS
 * rotates the managed master password (every 7 days by default).
 */
export function resetDb(): void {
  const old = clientPromise;
  clientPromise = undefined;
  old?.then((c) => c.$disconnect()).catch(() => {});
}

export type Db = PrismaClient;
