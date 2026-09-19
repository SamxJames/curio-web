"use client";

import { useId } from "react";
import clsx from "clsx";

type TextFieldProps = {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export default function TextField({ label, error, icon, className, id, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="mb-2 block font-sans text-xs tracking-wide text-ink-faint">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">{icon}</div>
        )}
        <input
          id={inputId}
          aria-describedby={errorId}
          aria-invalid={!!error}
          className={clsx(
            // No focus:border-accent — the global :focus-visible ring
            // (app/globals.css) already provides a visible focus indicator;
            // duplicating it with a :focus border-color change fires on
            // every mouse click (not just keyboard focus) and is exactly
            // the anti-pattern that ring's own comment argues against.
            "w-full rounded-full border border-line bg-transparent py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint",
            icon ? "pl-9 pr-3" : "px-4",
            className
          )}
          {...rest}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 font-sans text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
