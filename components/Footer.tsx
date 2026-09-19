import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page items-center justify-between px-6 py-6 font-sans text-xs text-ink-faint">
        <span>Curio</span>
        <Link href="/attribution" className="hover:text-ink-soft">
          Word origins from Wiktionary (CC BY-SA)
        </Link>
      </div>
    </footer>
  );
}
