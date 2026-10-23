/**
 * End-to-end tests that call the Lambda handler with API Gateway (HTTP API v2)
 * events against a real Postgres database (DATABASE_URL). Run `npm run seed` first.
 *
 *   HANDLER=dist/index.mjs npm test   # test the bundled Lambda instead of the source
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import "dotenv/config";

process.env.AWS_LAMBDA_FUNCTION_NAME ??= "inventory-test";
process.env.DB_IDLE_MS ??= "200";

const mod = await import(
  process.env.HANDLER ? pathToFileURL(resolve(process.env.HANDLER)).href : "../src/lambda.js"
);
const handler = mod.handler as (e: unknown, c: unknown) => Promise<{ statusCode: number; body: string }>;

const adminClaims = { sub: "u-admin", email: "admin@example.com", "cognito:groups": "[admin]" };
const staffClaims = { sub: "u-staff", email: "staff@example.com" };

async function call(
  method: string,
  path: string,
  { body, query, claims = adminClaims }: { body?: unknown; query?: Record<string, string>; claims?: object | null } = {},
) {
  const event = {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: new URLSearchParams(query ?? {}).toString(),
    queryStringParameters: query,
    headers: { "content-type": "application/json", host: "api.example.com" },
    requestContext: {
      http: { method, path, sourceIp: "127.0.0.1", protocol: "HTTP/1.1", userAgent: "test" },
      ...(claims ? { authorizer: { jwt: { claims, scopes: null } } } : {}),
      requestId: "test",
      stage: "$default",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  };
  const res = await handler(event, { callbackWaitsForEmptyEventLoop: true });
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
}

test("health is public", async () => {
  const r = await call("GET", "/health", { claims: null });
  assert.equal(r.status, 200);
});

test("protected routes need a token", async () => {
  const r = await call("GET", "/products", { claims: null });
  assert.equal(r.status, 401);
});

test("dashboard returns KPIs and a filled series for every range", async () => {
  for (const range of ["7d", "30d", "90d", "12m"]) {
    const r = await call("GET", "/dashboard", { query: { range } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.kpis.revenue.value > 0);
    assert.ok(r.json.series.length >= (range === "12m" ? 12 : 7));
    assert.ok(Array.isArray(r.json.lowStock));
  }
});

test("product list supports search, status filter, sorting and paging", async () => {
  const all = await call("GET", "/products", { query: { pageSize: "5", sort: "price", order: "desc" } });
  assert.equal(all.status, 200);
  assert.equal(all.json.items.length, 5);
  assert.ok(all.json.items[0].price >= all.json.items[4].price);

  const low = await call("GET", "/products", { query: { status: "low", pageSize: "100" } });
  for (const p of low.json.items) assert.ok(p.stockQuantity > 0 && p.stockQuantity <= p.reorderLevel);

  const out = await call("GET", "/products", { query: { status: "out" } });
  for (const p of out.json.items) assert.equal(p.stockQuantity, 0);

  const q = await call("GET", "/products", { query: { q: "STAR" } });
  assert.ok(q.json.items.every((p: { name: string }) => /star/i.test(p.name) || p));
  assert.ok(q.json.total >= 1);
});

test("create, update, sell, restock, archive a product", async () => {
  const sku = `TEST-${Date.now()}`;
  const created = await call("POST", "/products", {
    body: { name: "Test Fern", sku, price: 12.5, stockQuantity: 5, reorderLevel: 3, category: "Ferns" },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.productId;

  // Partial update must not reset other fields
  const upd = await call("PATCH", `/products/${id}`, { body: { price: 14 } });
  assert.equal(upd.json.price, 14);
  assert.equal(upd.json.stockQuantity, 5);
  assert.equal(upd.json.category, "Ferns");

  const dup = await call("POST", "/products", { body: { name: "Dup", sku, price: 1 } });
  assert.equal(dup.status, 409);

  const bad = await call("POST", "/products", { body: { name: "", price: -1 } });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.issues.length >= 2);

  const sale = await call("POST", "/sales", { body: { productId: id, quantity: 4 } });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  assert.equal(sale.json.totalAmount, 56);
  assert.equal(sale.json.product.stockQuantity, 1);

  const oversell = await call("POST", "/sales", { body: { productId: id, quantity: 2 } });
  assert.equal(oversell.status, 409);

  const restock = await call("POST", "/purchases", {
    body: { productId: id, quantity: 20, unitCost: 6.25, supplier: "Test Supplier" },
  });
  assert.equal(restock.status, 201);
  assert.equal(restock.json.product.stockQuantity, 21);
  assert.equal(restock.json.totalCost, 125);

  const detail = await call("GET", `/products/${id}`);
  assert.equal(detail.json.Sales.length, 1);
  assert.equal(detail.json.Purchases.length, 1);

  const staffDelete = await call("DELETE", `/products/${id}`, { claims: staffClaims });
  assert.equal(staffDelete.status, 403);

  const del = await call("DELETE", `/products/${id}`);
  assert.equal(del.status, 204);
  const gone = await call("GET", "/products", { query: { q: sku } });
  assert.equal(gone.json.total, 0);
  const archived = await call("GET", "/products", { query: { q: sku, status: "archived" } });
  assert.equal(archived.json.total, 1);
});

test("global search spans products, users and expenses", async () => {
  const r = await call("GET", "/search", { query: { q: "sal" } });
  assert.equal(r.status, 200);
  assert.ok(r.json.expenses.length > 0, "finds Salaries expenses");
  const empty = await call("GET", "/search", { query: { q: "" } });
  assert.equal(empty.status, 400);
});

test("expenses: list, by category, create, delete", async () => {
  const cats = await call("GET", "/expenses/by-category");
  assert.ok(cats.json.length > 0);
  const created = await call("POST", "/expenses", { body: { category: "Test", amount: 10.5 } });
  assert.equal(created.status, 201);
  const del = await call("DELETE", `/expenses/${created.json.expenseId}`);
  assert.equal(del.status, 204);
  const missing = await call("DELETE", `/expenses/${created.json.expenseId}`);
  assert.equal(missing.status, 404);
});

test("users list and me", async () => {
  const users = await call("GET", "/users", { query: { q: "a", pageSize: "3" } });
  assert.equal(users.json.items.length, 3);
  const me = await call("GET", "/me", { claims: staffClaims });
  assert.equal(me.json.email, "staff@example.com");
  assert.deepEqual(me.json.groups, []);
  const admin = await call("GET", "/me");
  assert.deepEqual(admin.json.groups, ["admin"]);
});
