import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      return saved;
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    localStorage.setItem("theme", theme);

    // Keep the mobile browser/PWA chrome color in sync with the actual app
    // theme once it's mounted — the static value in index.html is white to
    // match the pre-auth splash/login screens, which aren't theme-aware.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#080b10" : "#f8fafc");
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      console.log("[theme] toggled to", nextTheme);
      return nextTheme;
    });
  };

  return { theme, setTheme, toggleTheme };
}
