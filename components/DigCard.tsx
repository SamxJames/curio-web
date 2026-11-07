import Link from "next/link";
import { DIG_PITCH } from "@/lib/dig/pitch";

/** Today's dig, at the top of the homepage: the launch front door. Server-safe (no hooks). */
export default function DigCard() {
  return (
    <Link href="/dig" className="mb-12 block w-full border border-line p-5 transition-colors hover:border-line-strong">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Today&apos;s dig</p>
      <p className="mt-2 max-w-[46ch] font-serif text-lg leading-relaxed text-ink">{DIG_PITCH}</p>
      {/* A span, not <Button>: a <button> inside a link is invalid HTML. Same classes as Button's primary/md. */}
      <span className="mt-4 inline-flex items-center rounded-full bg-accent-button px-5 py-2.5 font-sans text-sm font-medium text-paper">
        Start today&apos;s dig
      </span>
    </Link>
  );
}
