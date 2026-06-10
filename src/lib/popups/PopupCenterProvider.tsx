import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * مدت زمان نگه‌داری پاپ‌آپ در مرکز اعلان‌ها — از پیکربندی متمرکز خوانده می‌شود.
 * در آینده می‌توان مقدار را از تنظیمات سرور override کرد.
 */
export { POPUP_TTL_MS } from "./config";
import { POPUP_TTL_MS } from "./config";

const STORAGE_KEY = "afrakala.popup-center.v1";

export type PopupItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: number;
};

type Ctx = {
  items: PopupItem[];
  unseenCount: number;
  add: (p: Omit<PopupItem, "id" | "createdAt"> & { id?: string; createdAt?: number }) => void;
  markSeen: (id: string) => void;
  clearAll: () => void;
};

const PopupCenterContext = createContext<Ctx | null>(null);

function readStorage(): PopupItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PopupItem[];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function writeStorage(items: PopupItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

function pruneExpired(items: PopupItem[]): PopupItem[] {
  const now = Date.now();
  return items.filter((i) => now - i.createdAt < POPUP_TTL_MS);
}

export function PopupCenterProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PopupItem[]>(() => pruneExpired(readStorage()));

  // پاک‌سازی دوره‌ای آیتم‌های منقضی
  useEffect(() => {
    const t = window.setInterval(() => {
      setItems((prev) => {
        const next = pruneExpired(prev);
        if (next.length !== prev.length) writeStorage(next);
        return next;
      });
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // sync بین تب‌ها
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(pruneExpired(readStorage()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback<Ctx["add"]>((p) => {
    setItems((prev) => {
      const id = p.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // جلوگیری از تکراری بودن id
      if (prev.some((x) => x.id === id)) return prev;
      const next = pruneExpired([
        { id, title: p.title, body: p.body, type: p.type, createdAt: p.createdAt ?? Date.now() },
        ...prev,
      ]);
      writeStorage(next);
      return next;
    });
  }, []);

  const markSeen = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems(() => {
      writeStorage([]);
      return [];
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ items, unseenCount: items.length, add, markSeen, clearAll }),
    [items, add, markSeen, clearAll],
  );

  return <PopupCenterContext.Provider value={value}>{children}</PopupCenterContext.Provider>;
}

export function usePopupCenter(): Ctx {
  const ctx = useContext(PopupCenterContext);
  if (!ctx) {
    // fallback no-op برای کامپوننت‌هایی که خارج از provider رندر می‌شوند
    return {
      items: [],
      unseenCount: 0,
      add: () => {},
      markSeen: () => {},
      clearAll: () => {},
    };
  }
  return ctx;
}