import { Router } from "express";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { HttpError, notFound, paged, pagination } from "../lib/http.js";
import type { Prisma } from "../generated/prisma/client.js";

const listQuery = pagination.extend({
  productId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ----------------------------- Sales ----------------------------- */

export const salesRouter = Router();

const saleBody = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  unitPrice: z.coerce.number().nonnegative().optional(),
  note: z.string().trim().max(300).optional(),
  timestamp: z.coerce.date().optional(),
});

salesRouter.get("/", async (req, res) => {
  const db = await getDb();
  const { page, pageSize, productId, q, from, to } = listQuery.parse(req.query);
  const where: Prisma.SalesWhereInput = {
    productId,
    timestamp: { gte: from, lte: to },
    ...(q ? { product: { name: { contains: q, mode: "insensitive" } } } : {}),
  };
  const [items, total] = await Promise.all([
    db.sales.findMany({
      where,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.sales.count({ where }),
  ]);
  res.json(paged(items, total, page, pageSize));
});

/** Records a sale and takes the quantity out of stock in one transaction. */
salesRouter.post("/", async (req, res) => {
  const db = await getDb();
  const body = saleBody.parse(req.body);

  const sale = await db.$transaction(async (tx) => {
    const product = await tx.products.findFirst({
      where: { productId: body.productId, archivedAt: null },
    });
    if (!product) throw notFound("Product");

    // Conditional update guards against two sales racing for the last units.
    const updated = await tx.products.updateMany({
      where: { productId: product.productId, stockQuantity: { gte: body.quantity } },
      data: { stockQuantity: { decrement: body.quantity } },
    });
    if (updated.count === 0) {
      throw new HttpError(409, `Only ${product.stockQuantity} in stock`);
    }

    const unitPrice = body.unitPrice ?? product.price;
    return tx.sales.create({
      data: {
        productId: product.productId,
        quantity: body.quantity,
        unitPrice,
        totalAmount: round2(unitPrice * body.quantity),
        note: body.note,
        timestamp: body.timestamp,
      },
      include: { product: { select: { name: true, sku: true, stockQuantity: true } } },
    });
  });
  res.status(201).json(sale);
});

/* --------------------------- Purchases --------------------------- */

export const purchasesRouter = Router();

const purchaseBody = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  unitCost: z.coerce.number().nonnegative(),
  supplier: z.string().trim().max(120).optional(),
  timestamp: z.coerce.date().optional(),
});

purchasesRouter.get("/", async (req, res) => {
  const db = await getDb();
  const { page, pageSize, productId, q, from, to } = listQuery.parse(req.query);
  const where: Prisma.PurchasesWhereInput = {
    productId,
    timestamp: { gte: from, lte: to },
    ...(q
      ? {
          OR: [
            { product: { name: { contains: q, mode: "insensitive" } } },
            { supplier: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.purchases.findMany({
      where,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchases.count({ where }),
  ]);
  res.json(paged(items, total, page, pageSize));
});

/** Records stock received from a supplier and adds it to stock. */
purchasesRouter.post("/", async (req, res) => {
  const db = await getDb();
  const body = purchaseBody.parse(req.body);

  const purchase = await db.$transaction(async (tx) => {
    const product = await tx.products.findFirst({
      where: { productId: body.productId, archivedAt: null },
    });
    if (!product) throw notFound("Product");
    await tx.products.update({
      where: { productId: product.productId },
      data: { stockQuantity: { increment: body.quantity } },
    });
    return tx.purchases.create({
      data: {
        productId: product.productId,
        quantity: body.quantity,
        unitCost: body.unitCost,
        totalCost: round2(body.unitCost * body.quantity),
        supplier: body.supplier,
        timestamp: body.timestamp,
      },
      include: { product: { select: { name: true, sku: true, stockQuantity: true } } },
    });
  });
  res.status(201).json(purchase);
});
