"use client";

import clsx from "clsx";

type IconButtonProps = {
  /** Becomes aria-label — required, not optional. An icon-only control with
   * no accessible name is invisible to screen readers regardless of how it
   * looks. */
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Most icon buttons (e.g. ThemeToggle) are bordered pills; some
   * (e.g. HistoryList's favorite heart) are borderless icon-only controls.
   * Defaults to `true` to match the more common bordered case. */
  bordered?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label">;

export default function IconButton({ label, children, className, bordered = true, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={clsx(
        // min-h/min-w (not h/w) so a caller that also renders a visible text
        // label alongside the icon (ThemeToggle) can grow past 44px wide
        // without the icon+label combination being force-squared.
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-ink-soft transition-colors hover:text-ink",
        bordered && "border border-line hover:border-accent",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
