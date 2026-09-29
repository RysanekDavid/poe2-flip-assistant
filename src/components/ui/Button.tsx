"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Amber is the only accent: exactly one primary action per panel should carry it.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-amber-400 text-neutral-950 hover:bg-amber-300",
  secondary: "border border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500 hover:text-neutral-100",
  danger: "border border-red-500/40 bg-red-950/40 text-red-200 hover:border-red-400/70 hover:bg-red-950/70",
  ghost: "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
};

/**
 * The app's one button. Defaults to type="button" so a button inside a form never submits by
 * accident. Icon-only buttons must pass aria-label — there is no visible text to name them.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", type = "button", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    />
  );
});
