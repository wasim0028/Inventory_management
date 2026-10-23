import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import { api } from "./api";

export type Theme = "light" | "dark" | "system";

/** Dialogs any page (or the search palette) can open. */
export type Dialog =
  | { kind: "product"; productId?: string }
  | { kind: "sale"; productId?: string }
  | { kind: "purchase"; productId?: string }
  | { kind: "expense" }
  | null;

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  theme: Theme;
  searchOpen: boolean;
  dialog: Dialog;
  /** Product shown in the side panel */
  drawerProductId: string | null;
}

const initialState: UiState = {
  sidebarCollapsed: false,
  mobileNavOpen: false,
  theme: "system",
  searchOpen: false,
  dialog: null,
  drawerProductId: null,
};

const ui = createSlice({
  name: "ui",
  initialState,
  reducers: {
    hydrate: (s, a: PayloadAction<Partial<Pick<UiState, "sidebarCollapsed" | "theme">>>) => ({ ...s, ...a.payload }),
    toggleSidebar: (s) => {
      s.sidebarCollapsed = !s.sidebarCollapsed;
    },
    setMobileNav: (s, a: PayloadAction<boolean>) => {
      s.mobileNavOpen = a.payload;
    },
    setTheme: (s, a: PayloadAction<Theme>) => {
      s.theme = a.payload;
    },
    setSearchOpen: (s, a: PayloadAction<boolean>) => {
      s.searchOpen = a.payload;
    },
    openDialog: (s, a: PayloadAction<Dialog>) => {
      s.dialog = a.payload;
      s.searchOpen = false;
    },
    closeDialog: (s) => {
      s.dialog = null;
    },
    openProduct: (s, a: PayloadAction<string | null>) => {
      s.drawerProductId = a.payload;
      s.searchOpen = false;
    },
  },
});

export const { hydrate, toggleSidebar, setMobileNav, setTheme, setSearchOpen, openDialog, closeDialog, openProduct } =
  ui.actions;

export function makeStore() {
  return configureStore({
    reducer: { ui: ui.reducer, [api.reducerPath]: api.reducer },
    middleware: (gdm) => gdm().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export const useAppDispatch = () => useDispatch<AppStore["dispatch"]>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
