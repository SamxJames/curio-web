import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import { verifyConfirmToken } from "@/lib/confirmToken";
import { maskEmail, unsubscribeSecret } from "@/lib/unsubscribeToken";

export const metadata: Metadata = {
  title: "Confirm your subscription — Curio",
  robots: { index: false, follow: false },
};

/** Where the confirmation email's link lands. Viewing it changes nothing
 * (mail scanners open every link); only the button's POST subscribes. */
export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const secret = unsubscribeSecret();
  const claim = typeof token === "string" && secret ? verifyConfirmToken(token, secret) : null;
  if (!claim || typeof token !== "string") redirect("/subscribed?ok=0");

  return (
    <section className="mx-auto max-w-form px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Confirm your subscription</h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        Curio&apos;s word of the day will go to {maskEmail(claim.email)} each morning. Every email has a one-click unsubscribe.
      </p>
      <form method="post" action={`/api/subscribe/confirm?token=${encodeURIComponent(token)}`} className="mt-8">
        <Button type="submit">Confirm</Button>
      </form>
    </section>
  );
}
