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
template.yaml          AWS SAM: Cognito, API Gateway, Lambda
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

The steps use the Mumbai region (`ap-south-1`); change it if you use another region.

### 1. Database credentials in Secrets Manager

You can keep the RDS PostgreSQL database from v1. The upgrade migration keeps your
existing products, sales, purchases, expenses and users.

- If the RDS instance was created with **Manage master credentials in AWS Secrets
  Manager**, use that secret's ARN.
- Otherwise create a secret: Secrets Manager → **Store a new secret** →
  **Credentials for Amazon RDS database** → enter the username and password → choose your
  database → name it (for example `inventory/db`). Copy its ARN.

### 2. Update the database schema

Run this from a machine that can reach the database, such as your EC2 instance in the
same VPC, or your computer if the database is publicly accessible:

```bash
cd server
npm ci
DATABASE_URL="postgresql://USER:PASSWORD@YOUR-RDS-ENDPOINT:5432/DBNAME?sslmode=require" \
  npx prisma migrate deploy
```

> The migration removes the four v1 summary tables (`SalesSummary`, `PurchaseSummary`,
> `ExpenseSummary`, `ExpenseByCategory`). The dashboard now calculates these numbers from
> the real data. Per-category expense rows are copied into `Expenses` first.
> Take an RDS snapshot before running it if you want a way back.

To load the demo data instead, also run `npm run seed` with the same `DATABASE_URL`.
**This deletes all existing data.**

### 3. Deploy the API (Cognito, API Gateway, Lambda)

Install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html), then:

```bash
cd server && npm ci && npm run build && cd ..
sam deploy --guided --region ap-south-1
```

`--guided` asks for each parameter and saves your answers in `samconfig.toml`:

| Parameter | Value |
|---|---|
| `DbSecretArn` | ARN from step 1 |
| `DbHost` | RDS endpoint, e.g. `mydb.abc123.ap-south-1.rds.amazonaws.com` |
| `DbName` | Database name (often `postgres`) |
| `AllowedOrigins` | `http://localhost:3000` for now; add the Amplify URL later |
| `SubnetIds`, `SecurityGroupIds` | See "Networking" below |
| `AllowSelfSignUp` | `false` (only you create accounts) or `true` |

When it finishes, note the outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`.

To deploy a later change: `cd server && npm run build && cd .. && sam deploy`.

#### Networking: how the Lambda reaches RDS

- **Private database (recommended):** put the Lambda in the database's VPC. Set
  `SubnetIds` to two private subnets and `SecurityGroupIds` to a new security group. In
  the RDS security group, allow inbound PostgreSQL (5432) from that group. A Lambda in a
  VPC has no internet access, so also add a **VPC interface endpoint for Secrets Manager**
  (VPC console → Endpoints → `com.amazonaws.ap-south-1.secretsmanager`, same subnets,
  a security group that allows 443 from the Lambda's group, private DNS on). The endpoint
  has an hourly charge per Availability Zone.
- **Publicly accessible database (simplest, less secure):** leave `SubnetIds` and
  `SecurityGroupIds` empty. Lambda has no fixed IP address, so the RDS security group
  must allow 5432 from anywhere. Use a strong password. The connection is still encrypted
  with TLS.

### 4. Create your first user

Cognito console → User pools → `inventory-prod-users`:

1. **Users → Create user**: enter your email and a temporary password. You choose a new
   password at first sign-in.
2. **Groups → admin → Add user to group**: admins can archive products, delete expenses
   and manage the team list. Everyone else can add and edit products, record sales,
   receive stock and add expenses.

### 5. Host the front end on Amplify

1. Push this project to GitHub.
2. Amplify console → **Create new app** → GitHub → pick the repo and branch. Tick
   **My app is a monorepo** and enter `client`. Amplify picks up `amplify.yml`.
3. Under **Environment variables** add:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `ApiUrl` output |
   | `NEXT_PUBLIC_AWS_REGION` | `ap-south-1` |
   | `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `UserPoolId` output |
   | `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `UserPoolClientId` output |
   | `NEXT_PUBLIC_CURRENCY` | `INR` (optional) |

4. Deploy. Then allow the site to call the API by re-running
   `sam deploy --parameter-overrides AllowedOrigins="https://main.xxxx.amplifyapp.com"`
   (comma-separate several URLs).

Once everything works you can stop or terminate the v1 EC2 instance, and the
API Gateway you set up for v1, so they stop costing money.

## Costs (small team)

| Service | What you pay for |
|---|---|
| Lambda, API Gateway | Per request; normally within the free tier or a few rupees a month at this size |
| Cognito | Lite tier: the first 10,000 monthly active users are free |
| Secrets Manager | About $0.40 a month for the database secret |
| RDS | The largest cost: instance hours and storage (same as v1) |
| Amplify Hosting | Build minutes and data served; small for this app |
| VPC endpoint | Only with the private-database setup: hourly per AZ |

Check current prices on each service's pricing page. An AWS Budget alert (Billing →
Budgets) is a good safety net.

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
