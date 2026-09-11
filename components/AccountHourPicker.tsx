"use client";

import { useState, useTransition } from "react";
import HourWheel from "./HourWheel";

/** Client wrapper so the account page can use the same HourWheel component
 * as onboarding — HourWheel needs live state (value/onChange), which a
 * server component's plain <form action> + native <select> can't provide.
 * `onSave` is a server action passed down from the page; server actions can
 * be called directly like any async function, not just bound to a <form>. */
export default function AccountHourPicker({
  initialHour,
  onSave,
  saveLabel,
}: {
  initialHour: number;
  onSave: (hour: number) => Promise<void>;
  saveLabel: string;
}) {
  const [hour, setHour] = useState(initialHour);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await onSave(hour);
    });
  }

  return (
    <div className="mt-4">
      <HourWheel value={hour} onChange={setHour} />
      <button
        onClick={handleSave}
        disabled={isPending}
        className="mt-4 w-40 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {isPending ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
