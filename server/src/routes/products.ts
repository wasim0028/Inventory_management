import { Router } from "express";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { notFound, paged, pagination } from "../lib/http.js";
import { requireGroup } from "../lib/auth.js";
import type { Prisma } from "../generated/prisma/client.js";

const router = Router();

const listQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  status: z.enum(["all", "in", "low", "out", "archived"]).default("all"),
  sort: z.enum(["name", "price", "stockQuantity", "rating", "updatedAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

const productFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s || null)
    .nullish(),
  category: z.string().trim().min(1).max(60),
  price: z.coerce.number().nonnegative("Price can't be negative"),
  rating: z.coerce.number().min(0).max(5).nullish(),
  stockQuantity: z.coerce.number().int().nonnegative(),
  reorderLevel: z.coerce.number().int().nonnegative(),
  imageUrl: z.url().max(500).nullish().or(z.literal("").transform(() => null)),
};

// Create: fill in sensible defaults.
const createBody = z.object({
  ...productFields,
  category: productFields.category.default("General"),
  stockQuantity: productFields.stockQuantity.default(0),
  reorderLevel: productFields.reorderLevel.default(10),
});
// Update: only the fields that were sent (no defaults, so nothing is reset).
const updateBody = z.object(productFields).partial();

router.get("/", async (req, res) => {
  const db = await getDb();
  const { q, category, status, sort, order, page, pageSize } = listQuery.parse(req.query);

  const where: Prisma.ProductsWhereInput = {
    archivedAt: status === "archived" ? { not: null } : null,
  };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }
  if (category) where.category = category;
  if (status === "out") where.stockQuantity = 0;
  if (status === "low") {
    where.AND = [
      { stockQuantity: { gt: 0 } },
      { stockQuantity: { lte: db.products.fields.reorderLevel } },
    ];
  }
  if (status === "in") where.stockQuantity = { gt: db.products.fields.reorderLevel };

  const [items, total] = await Promise.all([
    db.products.findMany({
      where,
      orderBy: [{ [sort]: order }, { productId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.products.count({ where }),
  ]);
  res.json(paged(items, total, page, pageSize));
});

router.get("/categories", async (_req, res) => {
  const db = await getDb();
  const rows = await db.products.groupBy({
    by: ["category"],
    where: { archivedAt: null },
    _count: { _all: true },
    orderBy: { category: "asc" },
  });
  res.json(rows.map((r) => ({ category: r.category, count: r._count._all })));
});

router.get("/:id", async (req, res) => {
  const db = await getDb();
  const product = await db.products.findUnique({
    where: { productId: String(req.params.id) },
    include: {
      Sales: { orderBy: { timestamp: "desc" }, take: 10 },
      Purchases: { orderBy: { timestamp: "desc" }, take: 10 },
    },
  });
  if (!product) throw notFound("Product");
  res.json(product);
});

router.post("/", async (req, res) => {
  const db = await getDb();
  const data = createBody.parse(req.body);
  const product = await db.products.create({ data });
  res.status(201).json(product);
});

router.patch("/:id", async (req, res) => {
  const db = await getDb();
  const data = updateBody.parse(req.body);
  const product = await db.products.update({ where: { productId: String(req.params.id) }, data });
  res.json(product);
});

/** Archive (soft delete) so sales and purchase history stay intact. */
router.delete("/:id", requireGroup("admin"), async (req, res) => {
  const db = await getDb();
  await db.products.update({
    where: { productId: String(req.params.id) },
    data: { archivedAt: new Date() },
  });
  res.status(204).end();
});

router.post("/:id/restore", requireGroup("admin"), async (req, res) => {
  const db = await getDb();
  const product = await db.products.update({
    where: { productId: String(req.params.id) },
    data: { archivedAt: null },
  });
  res.json(product);
});

export default router;
