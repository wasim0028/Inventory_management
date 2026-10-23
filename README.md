# Stockroom: inventory management v2

A rebuilt version of the inventory dashboard. It started from Ed Roh's
[inventory management tutorial](https://github.com/ed-roh/inventory-management). The front end is a static Next.js site,
the API runs on AWS Lambda behind API Gateway, sign-in uses Amazon Cognito, and the data
stays in PostgreSQL (RDS).

```
Browser (Amplify Hosting, static files)
   │  sign in ──────────────► Amazon Cognito (user pool)
   │  Authorization: Bearer <ID token>
   ▼
API Gateway HTTP API ── JWT authorizer checks the Cognito token
   ▼
Lambda (Node.js 22, Express 5, Prisma 7) ──► Secrets Manager (DB password)
   ▼
RDS PostgreSQL
```

## What changed from v1

| Area | v1 | v2 |
|---|---|---|
| Front end | Next.js 14, React 18, Tailwind 3, MUI DataGrid | Next.js 16 (static export), React 19, Tailwind 4, no MUI |
| API | Express 4 on EC2 with PM2 | Express 5 on Lambda behind API Gateway |
| Database access | Prisma 5, DB URL in a `.env` on the server | Prisma 7 with the `pg` driver, password read from Secrets Manager |
| Sign-in | None | Cognito: sign in, sign up, email confirmation, password reset; `admin` group |
| Products | List and create only | Create, edit, archive and restore; SKU, category, reorder level |
| Stock | Static numbers | Recording a sale takes stock out; receiving a delivery adds it (both in a DB transaction, overselling blocked) |
| Low stock | None | Reorder level per product, low/sold-out filters, restock list on the dashboard |
| Search | Product name only, case-sensitive | Ctrl/⌘ K search across products, SKUs, people and expenses; case-insensitive search on every list |
| Dashboard | Pre-computed summary tables | Live numbers for 7/30/90 days or 12 months, compared with the previous period |
| Validation | None | Every request body and query validated (zod); clear 400/404/409 errors |
| Lists | Everything loaded at once | Server-side paging, sorting and filters kept in the URL |
| Look | Light/dark toggle | New design, light/dark/system themes, works on phones |
| Tests | None | API tests that call the Lambda handler against a real database |

## Project layout

```
infra/                 Terraform: network, RDS, Cognito, API Gateway + Lambda, Amplify, migrations, monitoring
.github/workflows/     PR checks (fmt, validate, tests, tflint, checkov, plan) and deploys
amplify.yml            Amplify Hosting build for the front end
docker-compose.yml     Local PostgreSQL, API and website (server/Dockerfile, client/Dockerfile)
server/
  src/app.ts           Express app (routes, auth, errors)
  src/lambda.ts        Lambda entry point
  src/local.ts         Local dev server
  src/routes/          dashboard, products, sales/purchases, expenses, users, search
  src/lib/db.ts        Prisma client; gets the DB password from Secrets Manager on AWS
  src/lib/auth.ts      Cognito claims, admin-only routes
  prisma/              schema, migrations, demo seed
  test/api.test.ts     End-to-end API tests
client/
  src/app/             pages: overview, products, sales, stock received, expenses, team, settings
  src/components/      app shell, search palette, dialogs, product panel, charts
  src/state/api.ts     RTK Query API client (adds the Cognito token to every call)
```

## Run it locally

### With Docker (everything in one command)

```bash
docker compose up --build
docker compose exec server npm run seed   # optional demo data (deletes existing data)
```

Open http://localhost:3000. This runs PostgreSQL, the API (http://localhost:8000) and the
website in local mode, with sign-in turned off.

### Without Docker

You need Node.js 22+ and a PostgreSQL database.

```bash
# 1. Database (or use any PostgreSQL you already have)
docker compose up -d db

# 2. API  (http://localhost:8000)
cd server
cp .env.example .env          # AUTH_DISABLED=true skips sign-in locally
npm install
npx prisma migrate deploy
npm run seed                  # demo data: 35 products, a year of sales (deletes existing data)
npm run dev

# 3. Front end  (http://localhost:3000), in a second terminal
cd client
cp .env.example .env.local    # leave the Cognito values empty for local mode
npm install
npm run dev
```

Run the API tests with `npm test` in `server/` (they use the database in `DATABASE_URL`).

## Deploy to AWS

All AWS infrastructure is defined in Terraform in [`infra/`](infra/README.md), with two
environments: **dev** (deployed from the `develop` branch) and **prod** (from `main`).
GitHub Actions checks every pull request and deploys on push, including database
migrations. Start with [infra/README.md](infra/README.md): it covers the one-time setup,
the first deploy, creating your first user, costs and rollbacks.

## API

All routes except `/health` need `Authorization: Bearer <Cognito ID token>`.
Lists accept `page` and `pageSize` (max 100) and return `{ items, total, page, pageSize, pageCount }`.

| Method & path | Notes |
|---|---|
| `GET /health` | Public |
| `GET /me` | The signed-in user's email and groups |
| `GET /dashboard?range=7d\|30d\|90d\|12m` | KPIs vs previous period, series, low stock, best sellers, expenses by category |
| `GET /products?q&category&status=all\|in\|low\|out\|archived&sort&order` | |
| `GET /products/categories` | |
| `GET /products/:id` | With the latest sales and deliveries |
| `POST /products`, `PATCH /products/:id` | |
| `DELETE /products/:id`, `POST /products/:id/restore` | Admin only. Archive keeps history. |
| `GET /sales`, `POST /sales` | Sale takes stock out; 409 if not enough stock |
| `GET /purchases`, `POST /purchases` | Delivery adds stock |
| `GET /expenses`, `GET /expenses/by-category`, `POST /expenses` | |
| `DELETE /expenses/:id` | Admin only |
| `GET /users`, `POST /users`, `DELETE /users/:id` | Team list. Adding/removing is admin only. |
| `GET /search?q=` | Products, people and expenses in one call |
