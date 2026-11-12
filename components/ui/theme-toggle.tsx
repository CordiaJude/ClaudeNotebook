"use client";
import { applyTheme } from "@/lib/theme";
import { Button } from "./button";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggle() {
  return (
    <Button
      variant="icon"
      aria-label="Toggle theme"
      onClick={() => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark")}
    >
      <span className="cn-show-light"><IconMoon /></span>
      <span className="cn-show-dark"><IconSun /></span>
    </Button>
  );
}
