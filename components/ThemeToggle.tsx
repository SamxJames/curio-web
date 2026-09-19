"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import {
  ThemePreference,
  setThemePreference,
  useThemePreference,
} from "@/lib/storage";
import IconButton from "@/components/ui/IconButton";

const OPTIONS: { value: ThemePreference; label: string; shortLabel: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match system", shortLabel: "System", icon: SunMoon },
  { value: "light", label: "Light", shortLabel: "Light", icon: Sun },
  { value: "dark", label: "Dark", shortLabel: "Dark", icon: Moon },
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
    <IconButton
      label={`Theme: ${current.label}. Click to change.`}
      title={`Theme: ${current.label}`}
      onClick={cycle}
      className="sm:px-3"
    >
      <Icon size={16} strokeWidth={1.75} />
      {/* Icon alone is enough on narrow viewports — the header nav is
       * already tight on mobile (see components/Header.tsx) — but wider
       * screens have the room to just say what mode is active. */}
      <span className="hidden font-sans text-xs sm:inline">{current.shortLabel}</span>
    </IconButton>
  );
}
