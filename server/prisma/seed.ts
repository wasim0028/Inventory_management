/**
 * Seeds demo data: the original products and users, plus a year of
 * consistent sales, purchases and expenses ending today, so the dashboard
 * has something meaningful to show. Deletes existing data first.
 *
 *   npm run seed
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const dataDir = join(import.meta.dirname, "seedData");
const load = <T>(file: string): T => JSON.parse(readFileSync(join(dataDir, file), "utf8"));

// Small deterministic RNG so every seed run produces the same data.
let state = 20261010;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const CATEGORIES = ["Perennials", "Shrubs", "Grasses", "Wildflowers", "Succulents"] as const;
const SUPPLIERS = ["GreenRoot Nurseries", "Valley Growers", "Sunfield Seeds", "Prairie Supply Co."];
const DAY = 86_400_000;

async function main() {
  const products = load<{ productId: string; name: string; price: number; rating: number }[]>("products.json");
  const users = load<{ userId: string; name: string; email: string }[]>("users.json");

  await db.$transaction([
    db.sales.deleteMany(),
    db.purchases.deleteMany(),
    db.expenses.deleteMany(),
    db.products.deleteMany(),
    db.users.deleteMany(),
  ]);

  const now = Date.now();

  const productRows = products.map((p, i) => {
    const reorderLevel = pick([20, 25, 30, 40, 50]);
    // Mostly healthy stock, a few running low and two sold out.
    const stockQuantity = i % 11 === 3 ? 0 : i % 6 === 1 ? int(1, reorderLevel) : int(reorderLevel + 10, 420);
    const price = round2(Math.max(4.5, p.price / 18)); // retail prices in a realistic range
    return {
      productId: p.productId,
      sku: `PLT-${String(i + 1).padStart(4, "0")}`,
      name: p.name,
      category: CATEGORIES[i % CATEGORIES.length],
      price,
      rating: p.rating,
      stockQuantity,
      reorderLevel,
      createdAt: new Date(now - 400 * DAY),
    };
  });
  await db.products.createMany({ data: productRows });

  await db.users.createMany({
    data: users.map((u, i) => ({ ...u, email: u.email.toLowerCase(), role: i < 3 ? "admin" : "staff" })),
  });

  // Sales: busier in spring and towards the present, more on weekends.
  const sales = [];
  for (let d = 365; d >= 0; d--) {
    const date = new Date(now - d * DAY);
    const month = date.getMonth();
    const season = month >= 2 && month <= 5 ? 1.6 : month >= 9 ? 0.8 : 1;
    const weekend = [0, 6].includes(date.getDay()) ? 1.4 : 1;
    const growth = 0.75 + (365 - d) / 730;
    const count = Math.round(int(3, 8) * season * weekend * growth);
    for (let n = 0; n < count; n++) {
      const p = pick(productRows);
      const quantity = int(1, 8);
      const unitPrice = round2(p.price * (rand() < 0.15 ? 0.9 : 1)); // occasional discount
      sales.push({
        productId: p.productId,
        quantity,
        unitPrice,
        totalAmount: round2(unitPrice * quantity),
        timestamp: new Date(date.getTime() - int(0, 10 * 3600) * 1000),
      });
    }
  }
  await db.sales.createMany({ data: sales });

  // Purchases: restocks every few days.
  const purchases = [];
  for (let d = 364; d >= 0; d -= int(2, 4)) {
    for (let n = 0; n < int(1, 3); n++) {
      const p = pick(productRows);
      const quantity = int(2, 6) * 10;
      const unitCost = round2(p.price * (0.45 + rand() * 0.15));
      purchases.push({
        productId: p.productId,
        quantity,
        unitCost,
        totalCost: round2(unitCost * quantity),
        supplier: pick(SUPPLIERS),
        timestamp: new Date(now - d * DAY - int(0, 8 * 3600) * 1000),
      });
    }
  }
  await db.purchases.createMany({ data: purchases });

  // Expenses: fixed monthly costs plus irregular ones.
  const expenses = [];
  const today = new Date(now);
  for (let m = 12; m >= 0; m--) {
    // Fixed costs are paid on the 1st of each month.
    const date = new Date(today.getFullYear(), today.getMonth() - m, 1, 9);
    expenses.push(
      { category: "Salaries", amount: round2(3800 + rand() * 300), description: "Monthly payroll", timestamp: date },
      { category: "Rent", amount: 1850, description: "Greenhouse lease", timestamp: date },
      { category: "Utilities", amount: round2(260 + rand() * 180), description: "Water and power", timestamp: date },
    );
    for (let n = 0; n < int(2, 4); n++) {
      const category = pick(["Office", "Marketing", "Professional", "Shipping"]);
      expenses.push({
        category,
        amount: round2(category === "Professional" ? 300 + rand() * 900 : 40 + rand() * 450),
        description: {
          Office: "Office supplies",
          Marketing: "Online ads",
          Professional: "Accounting services",
          Shipping: "Courier fees",
        }[category],
        timestamp: new Date(date.getTime() + int(1, 27) * DAY),
      });
    }
  }
  await db.expenses.createMany({ data: expenses.filter((e) => e.timestamp.getTime() <= now) });

  console.log(
    `Seeded ${productRows.length} products, ${users.length} users, ${sales.length} sales, ` +
      `${purchases.length} purchases, ${expenses.length} expenses`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
