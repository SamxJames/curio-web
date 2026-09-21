import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      {/* flex-wrap, not justify-between: a third item makes this row
          overflow at 375px otherwise, and the attribution link is the one
          that must never be pushed off-screen. */}
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-5 gap-y-2 px-6 py-6 font-sans text-xs text-ink-faint">
        <span>Curio</span>
        <Link href="/words" className="hover:text-ink-soft">
          All words
        </Link>
        <Link href="/attribution" className="ml-auto hover:text-ink-soft">
          Word origins from Wiktionary (CC BY-SA)
        </Link>
      </div>
    </footer>
  );
}
