"use client";

import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "md";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "disabled">;

// One radius rule (pill, per the design-system consolidation) and one
// padding/size scale for every button in the app — the four variants below
// are exactly the four near-duplicate class-string families found across
// the pre-consolidation codebase (see docs/superpowers/specs/
// 2026-09-19-design-system-consolidation-design.md), not a speculative
// design-system taxonomy.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-accent-button font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50",
  secondary:
    "rounded-full border border-line-strong text-ink-soft transition-colors hover:border-accent hover:text-ink",
  ghost: "text-ink-soft transition-colors hover:text-ink",
  link: "text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-soft",
};

export default function Button({
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  // ghost/link variants keep their own natural (unpadded) size — they're
  // inline text buttons in the source markup, not filled/bordered CTAs, so
  // forcing the sm/md padding scale onto them would visibly change every
  // one of the 7 bare-text call sites this variant replaces.
  const sizeClass = variant === "ghost" || variant === "link" ? "" : SIZE_CLASSES[size];

  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "cursor-pointer font-sans disabled:cursor-not-allowed",
        sizeClass,
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
