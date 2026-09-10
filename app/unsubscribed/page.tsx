export const metadata = { title: "Unsubscribed — Curio" };

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const success = ok !== "0";

  return (
    <section className="mx-auto max-w-[480px] px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">
        {success ? "You're unsubscribed" : "Something went wrong"}
      </h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        {success
          ? "No more daily emails. You can still browse Today and History any time — favorites and history stay on this device."
          : "That unsubscribe link looks invalid or already used. If you're still receiving emails and want them stopped, reply to any digest and let us know."}
      </p>
    </section>
  );
}
