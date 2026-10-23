"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  useCreateExpenseMutation,
  useCreateProductMutation,
  useCreatePurchaseMutation,
  useCreateSaleMutation,
  useGetCategoriesQuery,
  useGetProductQuery,
  useGetProductsQuery,
  useUpdateProductMutation,
  type Product,
} from "@/state/api";
import { closeDialog, useAppDispatch, useAppSelector } from "@/state/store";
import { useDebounced } from "@/lib/hooks";
import { count, errorMessage, moneyExact } from "@/lib/format";
import { Button, cx, Field, Input, Modal, Select, StockBadge } from "./ui";

/** All app-wide dialogs, driven by state.ui.dialog. */
export function Dialogs() {
  const dialog = useAppSelector((s) => s.ui.dialog);
  const dispatch = useAppDispatch();
  const close = () => dispatch(closeDialog());
  return (
    <>
      <ProductDialog open={dialog?.kind === "product"} productId={dialog?.kind === "product" ? dialog.productId : undefined} onClose={close} />
      <MovementDialog
        kind="sale"
        open={dialog?.kind === "sale"}
        productId={dialog?.kind === "sale" ? dialog.productId : undefined}
        onClose={close}
      />
      <MovementDialog
        kind="purchase"
        open={dialog?.kind === "purchase"}
        productId={dialog?.kind === "purchase" ? dialog.productId : undefined}
        onClose={close}
      />
      <ExpenseDialog open={dialog?.kind === "expense"} onClose={close} />
    </>
  );
}

/* --------------------------- Product form -------------------------- */

const emptyProduct = { name: "", sku: "", category: "General", price: "", stockQuantity: "0", reorderLevel: "10", rating: "" };

function ProductDialog({ open, productId, onClose }: { open: boolean; productId?: string; onClose: () => void }) {
  const editing = Boolean(productId);
  const { data: existing } = useGetProductQuery(productId!, { skip: !open || !productId });
  const { data: categories } = useGetCategoriesQuery(undefined, { skip: !open });
  const [create, { isLoading: creating }] = useCreateProductMutation();
  const [update, { isLoading: updating }] = useUpdateProductMutation();
  const [form, setForm] = useState(emptyProduct);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editing && existing && existing.productId === productId) {
      setForm({
        name: existing.name,
        sku: existing.sku ?? "",
        category: existing.category,
        price: String(existing.price),
        stockQuantity: String(existing.stockQuantity),
        reorderLevel: String(existing.reorderLevel),
        rating: existing.rating == null ? "" : String(existing.rating),
      });
    } else if (!editing) setForm(emptyProduct);
    // Fill once per open; refetches of the product must not overwrite edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, existing?.productId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      name: form.name,
      sku: form.sku || null,
      category: form.category || "General",
      price: Number(form.price),
      reorderLevel: Number(form.reorderLevel),
      rating: form.rating === "" ? null : Number(form.rating),
      // Stock on hand changes through sales and deliveries once a product exists.
      ...(editing ? {} : { stockQuantity: Number(form.stockQuantity) }),
    };
    try {
      if (editing) {
        await update({ id: productId!, body }).unwrap();
        toast.success(`Saved ${body.name}`);
      } else {
        await create(body).unwrap();
        toast.success(`Added ${body.name}`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit product" : "Add a product"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="product-form" loading={creating || updating}>
            {editing ? "Save changes" : "Add product"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2">
          {(id) => <Input id={id} required maxLength={120} value={form.name} onChange={set("name")} autoFocus />}
        </Field>
        <Field label="SKU" hint="Optional, must be unique">
          {(id) => <Input id={id} maxLength={40} value={form.sku} onChange={set("sku")} />}
        </Field>
        <Field label="Category">
          {(id) => (
            <>
              <Input id={id} list="category-options" required maxLength={60} value={form.category} onChange={set("category")} />
              <datalist id="category-options">
                {categories?.map((c) => <option key={c.category} value={c.category} />)}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Selling price">
          {(id) => <Input id={id} type="number" required min={0} step="0.01" inputMode="decimal" value={form.price} onChange={set("price")} />}
        </Field>
        <Field label="Rating" hint="0 to 5, optional">
          {(id) => <Input id={id} type="number" min={0} max={5} step="0.01" value={form.rating} onChange={set("rating")} />}
        </Field>
        {!editing && (
          <Field label="Opening stock">
            {(id) => <Input id={id} type="number" required min={0} step="1" value={form.stockQuantity} onChange={set("stockQuantity")} />}
          </Field>
        )}
        <Field label="Reorder at" hint="Flag as low stock at or below this">
          {(id) => <Input id={id} type="number" required min={0} step="1" value={form.reorderLevel} onChange={set("reorderLevel")} />}
        </Field>
        {editing && (
          <p className="col-span-2 rounded-lg bg-panel-2 px-3 py-2 text-[13px] text-ink-2">
            To change stock on hand, record a sale or receive stock. That keeps the history accurate.
          </p>
        )}
        {error && (
          <p role="alert" className="col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------- Product picker ------------------------- */

function ProductPicker({ value, onChange }: { value: Product | null; onChange: (p: Product | null) => void }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const term = useDebounced(q, 200);
  const { data, isFetching } = useGetProductsQuery({ q: term, pageSize: 8, sort: "name" });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-panel-2 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{value.name}</div>
          <div className="num text-xs text-ink-2">
            {[value.sku, `${count(value.stockQuantity)} in stock`, moneyExact(value.price)].filter(Boolean).join(", ")}
          </div>
        </div>
        <Button size="sm" variant="ghost" type="button" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        placeholder="Search by name or SKU"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        aria-label="Product"
        autoFocus
      />
      {focused && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-lg">
          {isFetching && !data && <li className="px-3 py-2 text-sm text-ink-3">Searching</li>}
          {data?.items.length === 0 && <li className="px-3 py-2 text-sm text-ink-2">No products match.</li>}
          {data?.items.map((p) => (
            <li key={p.productId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(p)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-panel-2"
              >
                <span className="truncate text-sm">{p.name}</span>
                <span className="flex items-center gap-2">
                  <StockBadge stock={p.stockQuantity} reorderLevel={p.reorderLevel} />
                  <span className="num text-xs text-ink-2">{count(p.stockQuantity)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------- Sale / receive stock form -------------------- */

function MovementDialog({
  kind,
  open,
  productId,
  onClose,
}: {
  kind: "sale" | "purchase";
  open: boolean;
  productId?: string;
  onClose: () => void;
}) {
  const isSale = kind === "sale";
  const { data: preset } = useGetProductQuery(productId!, { skip: !open || !productId });
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sell, { isLoading: selling }] = useCreateSaleMutation();
  const [receive, { isLoading: receiving }] = useCreatePurchaseMutation();

  // Reset the form each time the dialog opens (not when data arrives later,
  // so nothing the user already typed is overwritten).
  useEffect(() => {
    if (!open) return;
    setError("");
    setQuantity(isSale ? "1" : "10");
    setSupplier("");
    setNote("");
    setProduct(null);
  }, [open, isSale]);

  // Pre-select the product the dialog was opened for, once it has loaded.
  useEffect(() => {
    if (open && productId && preset?.productId === productId) setProduct(preset);
  }, [open, productId, preset]);

  // Suggest a price when the product changes: selling price for a sale,
  // half of it as a starting cost for a delivery.
  const productKey = product?.productId;
  useEffect(() => {
    if (product) setPrice(String(isSale ? product.price : Math.round(product.price * 50) / 100));
    else setPrice("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey, isSale]);

  const qty = Number(quantity) || 0;
  const unit = Number(price) || 0;
  const tooMany = isSale && product ? qty > product.stockQuantity : false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return setError("Choose a product first.");
    setError("");
    try {
      if (isSale) {
        const res = await sell({ productId: product.productId, quantity: qty, unitPrice: unit, note: note || undefined }).unwrap();
        toast.success(`Sold ${count(qty)} × ${product.name}`, {
          description: `${count(res.product?.stockQuantity ?? 0)} left in stock`,
        });
      } else {
        const res = await receive({
          productId: product.productId,
          quantity: qty,
          unitCost: unit,
          supplier: supplier || undefined,
        }).unwrap();
        toast.success(`Received ${count(qty)} × ${product.name}`, {
          description: `${count(res.product?.stockQuantity ?? 0)} now in stock`,
        });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isSale ? "Record a sale" : "Receive stock"}
      description={isSale ? "Takes the quantity out of stock." : "Adds a supplier delivery to stock."}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={`${kind}-form`}
            loading={selling || receiving}
            disabled={!product || qty < 1 || tooMany}
          >
            {isSale ? "Record sale" : "Receive stock"}
          </Button>
        </>
      }
    >
      <form id={`${kind}-form`} onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Product</span>
          <ProductPicker value={product} onChange={setProduct} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity" error={tooMany ? `Only ${count(product!.stockQuantity)} in stock` : undefined}>
            {(id) => (
              <Input id={id} type="number" min={1} step={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            )}
          </Field>
          <Field label={isSale ? "Unit price" : "Unit cost"}>
            {(id) => (
              <Input id={id} type="number" min={0} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
            )}
          </Field>
        </div>
        {isSale ? (
          <Field label="Note" hint="Optional, e.g. customer or order number">
            {(id) => <Input id={id} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        ) : (
          <Field label="Supplier" hint="Optional">
            {(id) => <Input id={id} maxLength={120} value={supplier} onChange={(e) => setSupplier(e.target.value)} />}
          </Field>
        )}
        <div className="flex items-baseline justify-between rounded-lg bg-panel-2 px-4 py-3">
          <span className="text-sm text-ink-2">Total</span>
          <span className="num font-display text-2xl font-semibold">{moneyExact(qty * unit)}</span>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------ Expense ----------------------------- */

const EXPENSE_CATEGORIES = ["Salaries", "Rent", "Utilities", "Office", "Marketing", "Professional", "Shipping"];

function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [create, { isLoading }] = useCreateExpenseMutation();

  useEffect(() => {
    if (open) {
      setAmount("");
      setDescription("");
      setError("");
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await create({ category, amount: Number(amount), description: description || undefined }).unwrap();
      toast.success(`Added ${category} expense`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an expense"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="expense-form" loading={isLoading}>
            Add expense
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Category">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Amount">
          {(id) => (
            <Input id={id} type="number" required min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          )}
        </Field>
        <Field label="Description" hint="Optional">
          {(id) => <Input id={id} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className={cx("rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger")}>
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
