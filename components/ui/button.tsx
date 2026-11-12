import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "icon";
  size?: "md" | "sm";
  asChild?: boolean;
};

export function Button({ variant = "primary", size = "md", asChild, className = "", type, ...rest }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const cls = `cn-btn ${variant === "icon" ? "cn-btn--ghost cn-btn--icon" : `cn-btn--${variant}`} ${size === "sm" ? "cn-btn--sm" : ""} ${className}`;
  return <Comp className={cls} type={asChild ? undefined : (type ?? "button")} {...rest} />;
}
