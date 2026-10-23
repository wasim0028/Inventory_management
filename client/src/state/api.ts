import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { config } from "@/lib/config";
import { getIdToken } from "@/lib/auth";

/* ------------------------------ Types ------------------------------ */

export interface Product {
  productId: string;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  rating: number | null;
  stockQuantity: number;
  reorderLevel: number;
  imageUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  category?: string;
  price: number;
  rating?: number | null;
  stockQuantity?: number;
  reorderLevel?: number;
  imageUrl?: string | null;
}

export interface Sale {
  saleId: string;
  productId: string;
  timestamp: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  note: string | null;
  product?: { name: string; sku: string | null; stockQuantity?: number };
}

export interface Purchase {
  purchaseId: string;
  productId: string;
  timestamp: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier: string | null;
  product?: { name: string; sku: string | null; stockQuantity?: number };
}

export interface ProductDetail extends Product {
  Sales: Sale[];
  Purchases: Purchase[];
}

export interface Expense {
  expenseId: string;
  category: string;
  amount: number;
  description: string | null;
  timestamp: string;
}

export interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface Me {
  sub: string;
  email?: string;
  username?: string;
  groups: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type Range = "7d" | "30d" | "90d" | "12m";
interface Kpi {
  value: number;
  change: number | null;
}

export interface Dashboard {
  range: Range;
  bucket: "day" | "week" | "month";
  kpis: Record<"revenue" | "orders" | "unitsSold" | "purchases" | "expenses" | "profit", Kpi>;
  inventory: { value: number; units: number; products: number; lowStockCount: number; outOfStockCount: number };
  lowStock: Pick<Product, "productId" | "name" | "sku" | "stockQuantity" | "reorderLevel">[];
  topProducts: { productId: string; name?: string; sku?: string | null; stockQuantity?: number; revenue: number; units: number }[];
  expenseByCategory: { category: string; amount: number }[];
  series: { bucket: string; revenue: number; units: number; cost: number; expenses: number }[];
}

export interface SearchResults {
  products: Pick<Product, "productId" | "name" | "sku" | "category" | "stockQuantity" | "reorderLevel" | "price">[];
  users: Pick<User, "userId" | "name" | "email">[];
  expenses: Pick<Expense, "expenseId" | "category" | "amount" | "description" | "timestamp">[];
}

export interface ProductQuery {
  q?: string;
  category?: string;
  status?: "all" | "in" | "low" | "out" | "archived";
  sort?: "name" | "price" | "stockQuantity" | "rating" | "updatedAt";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ListQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  productId?: string;
  category?: string;
}

const clean = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all"));

/* ------------------------------- API ------------------------------- */

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: config.apiBaseUrl,
    prepareHeaders: async (headers) => {
      const token = await getIdToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Dashboard", "Products", "Product", "Sales", "Purchases", "Expenses", "Users", "Search"],
  endpoints: (b) => ({
    getMe: b.query<Me, void>({ query: () => "/me" }),

    getDashboard: b.query<Dashboard, Range>({
      query: (range) => ({ url: "/dashboard", params: { range } }),
      providesTags: ["Dashboard"],
    }),

    getProducts: b.query<Page<Product>, ProductQuery>({
      query: (params) => ({ url: "/products", params: clean(params) }),
      providesTags: ["Products"],
    }),
    getCategories: b.query<{ category: string; count: number }[], void>({
      query: () => "/products/categories",
      providesTags: ["Products"],
    }),
    getProduct: b.query<ProductDetail, string>({
      query: (id) => `/products/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Product", id }],
    }),
    createProduct: b.mutation<Product, ProductInput>({
      query: (body) => ({ url: "/products", method: "POST", body }),
      invalidatesTags: ["Products", "Dashboard", "Search"],
    }),
    updateProduct: b.mutation<Product, { id: string; body: Partial<ProductInput> }>({
      query: ({ id, body }) => ({ url: `/products/${id}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => ["Products", "Dashboard", "Search", { type: "Product", id }],
    }),
    archiveProduct: b.mutation<void, string>({
      query: (id) => ({ url: `/products/${id}`, method: "DELETE" }),
      invalidatesTags: ["Products", "Dashboard", "Search"],
    }),
    restoreProduct: b.mutation<Product, string>({
      query: (id) => ({ url: `/products/${id}/restore`, method: "POST" }),
      invalidatesTags: ["Products", "Dashboard", "Search"],
    }),

    getSales: b.query<Page<Sale>, ListQuery>({
      query: (params) => ({ url: "/sales", params: clean(params) }),
      providesTags: ["Sales"],
    }),
    createSale: b.mutation<Sale, { productId: string; quantity: number; unitPrice?: number; note?: string }>({
      query: (body) => ({ url: "/sales", method: "POST", body }),
      invalidatesTags: (_r, _e, { productId }) => [
        "Sales",
        "Products",
        "Dashboard",
        "Search",
        { type: "Product", id: productId },
      ],
    }),

    getPurchases: b.query<Page<Purchase>, ListQuery>({
      query: (params) => ({ url: "/purchases", params: clean(params) }),
      providesTags: ["Purchases"],
    }),
    createPurchase: b.mutation<Purchase, { productId: string; quantity: number; unitCost: number; supplier?: string }>({
      query: (body) => ({ url: "/purchases", method: "POST", body }),
      invalidatesTags: (_r, _e, { productId }) => [
        "Purchases",
        "Products",
        "Dashboard",
        "Search",
        { type: "Product", id: productId },
      ],
    }),

    getExpenses: b.query<Page<Expense>, ListQuery>({
      query: (params) => ({ url: "/expenses", params: clean(params) }),
      providesTags: ["Expenses"],
    }),
    getExpensesByCategory: b.query<{ category: string; amount: number; count: number }[], void>({
      query: () => "/expenses/by-category",
      providesTags: ["Expenses"],
    }),
    createExpense: b.mutation<Expense, { category: string; amount: number; description?: string }>({
      query: (body) => ({ url: "/expenses", method: "POST", body }),
      invalidatesTags: ["Expenses", "Dashboard", "Search"],
    }),
    deleteExpense: b.mutation<void, string>({
      query: (id) => ({ url: `/expenses/${id}`, method: "DELETE" }),
      invalidatesTags: ["Expenses", "Dashboard", "Search"],
    }),

    getUsers: b.query<Page<User>, ListQuery>({
      query: (params) => ({ url: "/users", params: clean(params) }),
      providesTags: ["Users"],
    }),
    createUser: b.mutation<User, { name: string; email: string; role: "admin" | "staff" }>({
      query: (body) => ({ url: "/users", method: "POST", body }),
      invalidatesTags: ["Users", "Search"],
    }),
    deleteUser: b.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: ["Users", "Search"],
    }),

    search: b.query<SearchResults, string>({
      query: (q) => ({ url: "/search", params: { q } }),
      providesTags: ["Search"],
      keepUnusedDataFor: 15,
    }),
  }),
});

export const {
  useGetMeQuery,
  useGetDashboardQuery,
  useGetProductsQuery,
  useGetCategoriesQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useArchiveProductMutation,
  useRestoreProductMutation,
  useGetSalesQuery,
  useCreateSaleMutation,
  useGetPurchasesQuery,
  useCreatePurchaseMutation,
  useGetExpensesQuery,
  useGetExpensesByCategoryQuery,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useGetUsersQuery,
  useCreateUserMutation,
  useDeleteUserMutation,
  useSearchQuery,
} = api;
