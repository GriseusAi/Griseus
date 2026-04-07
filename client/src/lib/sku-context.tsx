import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "griseus_selected_sku";
const DEFAULT_SKU = "ELT.7-11";

interface SKUContextType {
  selectedSku: string;
  setSelectedSku: (sku: string) => void;
}

const SKUContext = createContext<SKUContextType | undefined>(undefined);

export function SKUProvider({ children }: { children: ReactNode }) {
  const [selectedSku, setSkuState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_SKU;
    } catch {
      return DEFAULT_SKU;
    }
  });

  const setSelectedSku = useCallback((sku: string) => {
    setSkuState(sku);
    try {
      localStorage.setItem(STORAGE_KEY, sku);
    } catch {}
  }, []);

  return (
    <SKUContext.Provider value={{ selectedSku, setSelectedSku }}>
      {children}
    </SKUContext.Provider>
  );
}

export function useSKU() {
  const ctx = useContext(SKUContext);
  if (!ctx) throw new Error("useSKU must be used within SKUProvider");
  return ctx;
}
