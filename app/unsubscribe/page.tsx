import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import { maskEmail, unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

export const metadata: Metadata = {
  title: "Unsubscribe — Curio",
  robots: { index: false, follow: false },
};

/** The confirm step between an emailed unsubscribe link and the actual
 * unsubscribe: viewing this page changes nothing (scanners prefetch links);
 * only the button's POST does. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const secret = unsubscribeSecret();
  const email = typeof token === "string" && secret ? verifyUnsubscribeToken(token, secret) : null;
  if (!email || typeof token !== "string") redirect("/unsubscribed?ok=0");

  return (
    <section className="mx-auto max-w-form px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Unsubscribe from Curio?</h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        The daily email to {maskEmail(email)} will stop. You can still visit Curio any time.
      </p>
      <form method="post" action={`/api/unsubscribe?token=${encodeURIComponent(token)}`} className="mt-8">
        <Button type="submit">Unsubscribe</Button>
      </form>
    </section>
  );
}
