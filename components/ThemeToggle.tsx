"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import {
  ThemePreference,
  setThemePreference,
  useThemePreference,
} from "@/lib/storage";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match system", icon: SunMoon },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export default function ThemeToggle() {
  const pref = useThemePreference();

  function cycle() {
    const currentIndex = OPTIONS.findIndex((o) => o.value === pref);
    const next = OPTIONS[(currentIndex + 1) % OPTIONS.length].value;
    setThemePreference(next);
  }

  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0];
  const Icon = current.icon;

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${current.label}. Click to change.`}
      title={`Theme: ${current.label}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition-colors hover:text-ink hover:border-accent cursor-pointer"
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}
