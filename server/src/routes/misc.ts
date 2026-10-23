import { Router } from "express";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { paged, pagination } from "../lib/http.js";
import { requireGroup } from "../lib/auth.js";
import type { Prisma } from "../generated/prisma/client.js";

/* ---------------------------- Expenses --------------------------- */

export const expensesRouter = Router();

const expenseBody = z.object({
  category: z.string().trim().min(1).max(60),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  description: z.string().trim().max(300).optional(),
  timestamp: z.coerce.date().optional(),
});

expensesRouter.get("/", async (req, res) => {
  const db = await getDb();
  const { page, pageSize, q, category, from, to } = pagination
    .extend({
      q: z.string().trim().max(100).optional(),
      category: z.string().trim().max(60).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .parse(req.query);
  const where: Prisma.ExpensesWhereInput = {
    category,
    timestamp: { gte: from, lte: to },
    ...(q
      ? {
          OR: [
            { category: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.expenses.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.expenses.count({ where }),
  ]);
  res.json(paged(items, total, page, pageSize));
});

expensesRouter.get("/by-category", async (req, res) => {
  const db = await getDb();
  const { from, to } = z
    .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
    .parse(req.query);
  const rows = await db.expenses.groupBy({
    by: ["category"],
    where: { timestamp: { gte: from, lte: to } },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: "desc" } },
  });
  res.json(
    rows.map((r) => ({ category: r.category, amount: r._sum.amount ?? 0, count: r._count._all })),
  );
});

expensesRouter.post("/", async (req, res) => {
  const db = await getDb();
  const expense = await db.expenses.create({ data: expenseBody.parse(req.body) });
  res.status(201).json(expense);
});

expensesRouter.delete("/:id", requireGroup("admin"), async (req, res) => {
  const db = await getDb();
  await db.expenses.delete({ where: { expenseId: String(req.params.id) } });
  res.status(204).end();
});

/* ------------------------------ Users ---------------------------- */

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  const db = await getDb();
  const { page, pageSize, q } = pagination
    .extend({ q: z.string().trim().max(100).optional() })
    .parse(req.query);
  const where: Prisma.UsersWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    db.users.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.users.count({ where }),
  ]);
  res.json(paged(items, total, page, pageSize));
});

usersRouter.post("/", requireGroup("admin"), async (req, res) => {
  const db = await getDb();
  const data = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.email().max(200).transform((e) => e.toLowerCase()),
      role: z.enum(["admin", "staff"]).default("staff"),
    })
    .parse(req.body);
  res.status(201).json(await db.users.create({ data }));
});

usersRouter.delete("/:id", requireGroup("admin"), async (req, res) => {
  const db = await getDb();
  await db.users.delete({ where: { userId: String(req.params.id) } });
  res.status(204).end();
});

/* ------------------------------ Search --------------------------- */

export const searchRouter = Router();

/** One query across products, users and expenses, for the command palette. */
searchRouter.get("/", async (req, res) => {
  const db = await getDb();
  const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
  const contains = { contains: q, mode: "insensitive" as const };
  const [products, users, expenses] = await Promise.all([
    db.products.findMany({
      where: { archivedAt: null, OR: [{ name: contains }, { sku: contains }, { category: contains }] },
      select: { productId: true, name: true, sku: true, category: true, stockQuantity: true, reorderLevel: true, price: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    db.users.findMany({
      where: { OR: [{ name: contains }, { email: contains }] },
      select: { userId: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 4,
    }),
    db.expenses.findMany({
      where: { OR: [{ category: contains }, { description: contains }] },
      select: { expenseId: true, category: true, amount: true, description: true, timestamp: true },
      orderBy: { timestamp: "desc" },
      take: 4,
    }),
  ]);
  res.json({ products, users, expenses });
});
