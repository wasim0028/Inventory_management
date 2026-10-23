-- v2 upgrade: works on a fresh database (after the init migration) and on an
-- existing v1 database. Existing rows are kept.

-- Users
ALTER TABLE "Users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'staff',
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");
CREATE INDEX "Users_name_idx" ON "Users"("name");

-- Products
ALTER TABLE "Products" ADD COLUMN "sku" TEXT,
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN "reorderLevel" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "stockQuantity" SET DEFAULT 0;
-- Prisma manages updatedAt itself; the default above only back-fills existing rows.
ALTER TABLE "Products" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE UNIQUE INDEX "Products_sku_key" ON "Products"("sku");
CREATE INDEX "Products_name_idx" ON "Products"("name");
CREATE INDEX "Products_archivedAt_idx" ON "Products"("archivedAt");

-- Sales
ALTER TABLE "Sales" ADD COLUMN "note" TEXT,
ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Sales_productId_idx" ON "Sales"("productId");
CREATE INDEX "Sales_timestamp_idx" ON "Sales"("timestamp");

-- Purchases
ALTER TABLE "Purchases" ADD COLUMN "supplier" TEXT,
ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Purchases_productId_idx" ON "Purchases"("productId");
CREATE INDEX "Purchases_timestamp_idx" ON "Purchases"("timestamp");

-- Expenses
ALTER TABLE "Expenses" ADD COLUMN "description" TEXT,
ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Expenses_category_idx" ON "Expenses"("category");
CREATE INDEX "Expenses_timestamp_idx" ON "Expenses"("timestamp");

-- The pre-computed summary tables are replaced by live queries.
-- Keep any per-category expense rows by copying them into "Expenses" first.
INSERT INTO "Expenses" ("expenseId", "category", "amount", "timestamp")
SELECT "expenseByCategoryId", "category", "amount"::DOUBLE PRECISION, "date"
FROM "ExpenseByCategory"
ON CONFLICT ("expenseId") DO NOTHING;

DROP TABLE "ExpenseByCategory";
DROP TABLE "ExpenseSummary";
DROP TABLE "SalesSummary";
DROP TABLE "PurchaseSummary";
