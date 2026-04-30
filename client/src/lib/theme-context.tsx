import { createContext, useContext, useEffect, type ReactNode } from "react";

type Theme = "light";
const STORAGE_KEY = "griseus.theme";

type Ctx = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<Ctx>({ theme: "light", toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "light", toggleTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}
