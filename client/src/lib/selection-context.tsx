import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export type SelectedItem = {
  code: string;
  label: string;
  kind: "device" | "component" | "subassembly" | "subcomponent" | "variable";
  currentStock?: number;
  dailyBurnRate?: number;
  daysLeft?: number | null;
  usedBy: string[];
  isShared?: boolean;
  isBottleneck?: boolean;
  status?: string;
};

const STORAGE_KEY = "griseus.selection";
const MAX_SELECTION = 6;

type Ctx = {
  selected: SelectedItem[];
  toggle: (item: SelectedItem) => void;
  remove: (code: string) => void;
  clear: () => void;
  isSelected: (code: string) => boolean;
  indexOf: (code: string) => number;
  max: number;
};

const SelectionContext = createContext<Ctx>({
  selected: [],
  toggle: () => {},
  remove: () => {},
  clear: () => {},
  isSelected: () => false,
  indexOf: () => -1,
  max: MAX_SELECTION,
});

export function useSelection() {
  return useContext(SelectionContext);
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectedItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SelectedItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }, [selected]);

  const toggle = useCallback((item: SelectedItem) => {
    setSelected(prev => {
      const exists = prev.some(s => s.code === item.code);
      if (exists) return prev.filter(s => s.code !== item.code);
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, item];
    });
  }, []);

  const remove = useCallback((code: string) => {
    setSelected(prev => prev.filter(s => s.code !== code));
  }, []);

  const clear = useCallback(() => setSelected([]), []);
  const isSelected = useCallback((code: string) => selected.some(s => s.code === code), [selected]);
  const indexOf = useCallback((code: string) => selected.findIndex(s => s.code === code), [selected]);

  return (
    <SelectionContext.Provider
      value={{ selected, toggle, remove, clear, isSelected, indexOf, max: MAX_SELECTION }}
    >
      {children}
    </SelectionContext.Provider>
  );
}
