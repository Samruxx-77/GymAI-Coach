import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { THEME_IDS, THEMES, loadTheme, saveTheme, themeStyle, type ThemeId } from "../lib/themes";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeId[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Applies the token map to <html> as inline overrides (beats @theme defaults). */
export function applyTheme(id: ThemeId) {
  const el = document.documentElement;
  const style = themeStyle(id);
  for (const [key, value] of Object.entries(style)) {
    el.style.setProperty(key, value);
  }
  el.dataset.theme = id;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    if (!(id in THEMES)) return;
    setThemeState(id);
    saveTheme(id);
    // Apply synchronously so non-React consumers (WebGL scene) read fresh
    // tokens when the announcement below lands.
    applyTheme(id);
    // Lets non-React consumers (e.g. the WebGL scene) re-read tokens.
    window.dispatchEvent(new CustomEvent("themechange"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEME_IDS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
