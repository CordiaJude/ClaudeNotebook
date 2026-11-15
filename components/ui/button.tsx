import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "icon";
  size?: "sm" | "md" | "lg";
  /** Shows a spinner, keeps the label for screen readers, and blocks clicks without removing focus. */
  loading?: boolean;
  asChild?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, asChild, className = "", type, children, onClick, ...rest }: ButtonProps) {
  const cls = `ui-btn ${variant === "icon" ? "ui-btn--ghost ui-btn--icon" : `ui-btn--${variant}`} ${size === "md" ? "" : `ui-btn--${size}`} ${className}`;
  if (asChild) return <Slot className={cls} {...rest}>{children}</Slot>;
  return (
    <button className={cls} type={type ?? "button"} aria-busy={loading || undefined} aria-disabled={loading || undefined} onClick={loading ? (e) => e.preventDefault() : onClick} {...rest}>
      {loading ? <span className="ui-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
