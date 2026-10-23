/**
 * Password rotation: after the database password changes, the API answers one
 * request with 503, reloads its credentials, and then works again.
 *
 * Needs a PostgreSQL role that logs in with a password:
 *   ROTATION_ADMIN_URL=postgresql://postgres@localhost:5432/inventory   (can ALTER ROLE)
 *   ROTATION_USER=rotuser  (role with SELECT on the tables, password auth in pg_hba.conf)
 * Skipped when ROTATION_ADMIN_URL is not set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const adminUrl = process.env.ROTATION_ADMIN_URL;
const user = process.env.ROTATION_USER ?? "rotuser";

test("API recovers after the database password is rotated", { skip: !adminUrl }, async () => {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const host = new URL(adminUrl!).host;
  const db = new URL(adminUrl!).pathname;
  const urlFor = (pass: string) => `postgresql://${user}:${pass}@${host}${db}`;

  await admin.query(`ALTER ROLE ${user} PASSWORD 'OldPass1'`);
  process.env.DATABASE_URL = urlFor("OldPass1"); // stands in for the secret's current value
  process.env.AUTH_DISABLED = "true";
  process.env.DB_IDLE_MS = "100"; // close idle connections quickly
  process.env.DB_POOL_MAX = "1";

  const { createApp } = await import("../src/app.js");
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const get = () =>
    fetch(`http://127.0.0.1:${port}/products?pageSize=1`).then((r) => r.status);

  try {
    assert.equal(await get(), 200, "works with the original password");

    // Rotate: the database and the secret both get the new password.
    await admin.query(`ALTER ROLE ${user} PASSWORD 'NewPass2'`);
    process.env.DATABASE_URL = urlFor("NewPass2");
    await new Promise((r) => setTimeout(r, 300)); // let the pooled connection close

    assert.equal(await get(), 503, "first request after rotation fails and reloads credentials");
    assert.equal(await get(), 200, "next request uses the new password");
  } finally {
    server.close();
    await admin.query(`ALTER ROLE ${user} PASSWORD 'OldPass1'`);
    await admin.end();
    const { resetDb } = await import("../src/lib/db.js");
    resetDb();
  }
});
