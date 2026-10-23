import { Router } from "express";
import { z } from "zod";
import { getDb } from "../lib/db.js";

const router = Router();

const RANGES = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 } as const;
const BUCKET: Record<keyof typeof RANGES, "day" | "week" | "month"> = {
  "7d": "day",
  "30d": "day",
  "90d": "week",
  "12m": "month",
};

const pctChange = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;

/**
 * All dashboard numbers are computed live from Sales, Purchases, Expenses and
 * Products for the selected range, compared with the period just before it.
 */
router.get("/", async (req, res) => {
  const db = await getDb();
  const { range } = z
    .object({ range: z.enum(["7d", "30d", "90d", "12m"]).default("30d") })
    .parse(req.query);

  const days = RANGES[range];
  const bucket = BUCKET[range];
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);

  const period = (gte: Date, lt: Date) => ({ timestamp: { gte, lt } });

  const [
    salesNow,
    salesPrev,
    purchNow,
    purchPrev,
    expNow,
    expPrev,
    stock,
    lowStockCount,
    outOfStockCount,
    lowStock,
    topRaw,
    expenseByCategory,
    series,
  ] = await Promise.all([
    db.sales.aggregate({ where: period(from, to), _sum: { totalAmount: true, quantity: true }, _count: { _all: true } }),
    db.sales.aggregate({ where: period(prevFrom, from), _sum: { totalAmount: true, quantity: true }, _count: { _all: true } }),
    db.purchases.aggregate({ where: period(from, to), _sum: { totalCost: true, quantity: true } }),
    db.purchases.aggregate({ where: period(prevFrom, from), _sum: { totalCost: true, quantity: true } }),
    db.expenses.aggregate({ where: period(from, to), _sum: { amount: true } }),
    db.expenses.aggregate({ where: period(prevFrom, from), _sum: { amount: true } }),
    db.$queryRaw<{ value: number | null; units: bigint | null; products: bigint }[]>`
      SELECT SUM("price" * "stockQuantity")::float8 AS value,
             SUM("stockQuantity") AS units,
             COUNT(*) AS products
      FROM "Products" WHERE "archivedAt" IS NULL`,
    db.products.count({
      where: {
        archivedAt: null,
        stockQuantity: { gt: 0, lte: db.products.fields.reorderLevel },
      },
    }),
    db.products.count({ where: { archivedAt: null, stockQuantity: 0 } }),
    db.products.findMany({
      where: { archivedAt: null, stockQuantity: { lte: db.products.fields.reorderLevel } },
      orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
      select: { productId: true, name: true, sku: true, stockQuantity: true, reorderLevel: true },
      take: 6,
    }),
    db.sales.groupBy({
      by: ["productId"],
      where: period(from, to),
      _sum: { totalAmount: true, quantity: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    }),
    db.expenses.groupBy({
      by: ["category"],
      where: period(from, to),
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    db.$queryRaw<{ bucket: Date; revenue: number; cost: number; expenses: number; units: number }[]>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${bucket}, ${from}::timestamp),
          date_trunc(${bucket}, ${to}::timestamp),
          ('1 ' || ${bucket})::interval
        ) AS bucket
      ),
      s AS (
        SELECT date_trunc(${bucket}, "timestamp") AS bucket,
               SUM("totalAmount") AS revenue, SUM("quantity") AS units
        FROM "Sales" WHERE "timestamp" >= ${from}::timestamp AND "timestamp" < ${to}::timestamp
        GROUP BY 1
      ),
      p AS (
        SELECT date_trunc(${bucket}, "timestamp") AS bucket, SUM("totalCost") AS cost
        FROM "Purchases" WHERE "timestamp" >= ${from}::timestamp AND "timestamp" < ${to}::timestamp
        GROUP BY 1
      ),
      e AS (
        SELECT date_trunc(${bucket}, "timestamp") AS bucket, SUM("amount") AS expenses
        FROM "Expenses" WHERE "timestamp" >= ${from}::timestamp AND "timestamp" < ${to}::timestamp
        GROUP BY 1
      )
      SELECT b.bucket,
             COALESCE(s.revenue, 0)::float8  AS revenue,
             COALESCE(s.units, 0)::float8    AS units,
             COALESCE(p.cost, 0)::float8     AS cost,
             COALESCE(e.expenses, 0)::float8 AS expenses
      FROM buckets b
      LEFT JOIN s USING (bucket)
      LEFT JOIN p USING (bucket)
      LEFT JOIN e USING (bucket)
      ORDER BY b.bucket`,
  ]);

  const names = await db.products.findMany({
    where: { productId: { in: topRaw.map((t) => t.productId) } },
    select: { productId: true, name: true, sku: true, stockQuantity: true },
  });
  const byId = new Map(names.map((n) => [n.productId, n]));

  const revenue = salesNow._sum.totalAmount ?? 0;
  const prevRevenue = salesPrev._sum.totalAmount ?? 0;
  const purchases = purchNow._sum.totalCost ?? 0;
  const prevPurchases = purchPrev._sum.totalCost ?? 0;
  const expenses = expNow._sum.amount ?? 0;
  const prevExpenses = expPrev._sum.amount ?? 0;
  const profit = revenue - purchases - expenses;
  const prevProfit = prevRevenue - prevPurchases - prevExpenses;

  res.json({
    range,
    bucket,
    from,
    to,
    kpis: {
      revenue: { value: revenue, change: pctChange(revenue, prevRevenue) },
      orders: {
        value: salesNow._count._all,
        change: pctChange(salesNow._count._all, salesPrev._count._all),
      },
      unitsSold: {
        value: salesNow._sum.quantity ?? 0,
        change: pctChange(salesNow._sum.quantity ?? 0, salesPrev._sum.quantity ?? 0),
      },
      purchases: { value: purchases, change: pctChange(purchases, prevPurchases) },
      expenses: { value: expenses, change: pctChange(expenses, prevExpenses) },
      profit: { value: profit, change: pctChange(profit, prevProfit) },
    },
    inventory: {
      value: stock[0]?.value ?? 0,
      units: Number(stock[0]?.units ?? 0),
      products: Number(stock[0]?.products ?? 0),
      lowStockCount,
      outOfStockCount,
    },
    lowStock,
    topProducts: topRaw.map((t) => ({
      ...byId.get(t.productId),
      productId: t.productId,
      revenue: t._sum.totalAmount ?? 0,
      units: t._sum.quantity ?? 0,
    })),
    expenseByCategory: expenseByCategory.map((e) => ({
      category: e.category,
      amount: e._sum.amount ?? 0,
    })),
    series: series.map((s) => ({ ...s, bucket: new Date(s.bucket).toISOString() })),
  });
});

export default router;
