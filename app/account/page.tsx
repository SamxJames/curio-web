import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "@/lib/db";

export const metadata = { title: "Account — Curio" };

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Matches the 12-hour AM/PM format the homepage's HourWheel already uses —
 * the account page previously showed raw 24-hour UTC ("21:00 UTC"), which
 * was the only place in the app not using that convention. */
function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const email = session.user.email;
  const subscriber = email ? await getSubscriberByEmail(email) : null;

  async function updateSubscription(formData: FormData) {
    "use server";
    if (!email) return;
    const hour = Number(formData.get("hour"));
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      await upsertSubscriber(email, hour);
    }
    revalidatePath("/account");
  }

  async function unsubscribe() {
    "use server";
    if (!email) return;
    await removeSubscriber(email);
    revalidatePath("/account");
  }

  return (
    <section className="mx-auto max-w-[440px] px-6 py-20">
      <h1 className="font-serif text-3xl">Account</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">{session.user.email}</p>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="font-sans text-xs tracking-wide text-ink-faint">Daily email</h2>

        {subscriber ? (
          <p className="mt-2 font-sans text-sm text-ink-soft">
            Subscribed — delivered at {formatHour(subscriber.hour)} UTC.
          </p>
        ) : (
          <p className="mt-2 font-sans text-sm text-ink-soft">Not subscribed yet.</p>
        )}

        <form action={updateSubscription} className="mt-4 flex items-center gap-2">
          <select
            name="hour"
            defaultValue={subscriber?.hour ?? 9}
            className="rounded-md border border-line bg-transparent px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
          >
            {HOURS.map((h) => (
              <option key={h} value={h} className="bg-paper text-ink">
                {formatHour(h)} UTC
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={
              subscriber
                ? "rounded-md border border-line px-4 py-2 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
                : "rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
            }
          >
            {subscriber ? "Save" : "Subscribe"}
          </button>
        </form>

        {subscriber && (
          <form action={unsubscribe} className="mt-3">
            <button
              type="submit"
              className="font-sans text-sm text-ink-faint underline underline-offset-2 transition-colors hover:text-danger cursor-pointer"
            >
              Unsubscribe
            </button>
          </form>
        )}
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className="mt-10"
      >
        <button
          type="submit"
          className="rounded-md border border-line px-4 py-2.5 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
        >
          Sign out
        </button>
      </form>
    </section>
  );
}
