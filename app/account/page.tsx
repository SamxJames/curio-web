import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "@/lib/db";

export const metadata = { title: "Account — Curio" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const email = session.user.email;
  const subscriber = email ? await getSubscriberByEmail(email) : null;

  async function subscribe() {
    "use server";
    if (!email) return;
    await upsertSubscriber(email);
    revalidatePath("/account");
  }

  async function unsubscribe() {
    "use server";
    if (!email) return;
    await removeSubscriber(email);
    revalidatePath("/account");
  }

  return (
    <section className="mx-auto max-w-form px-6 py-20">
      <h1 className="font-serif text-3xl">Account</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">{session.user.email}</p>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="font-sans text-xs tracking-wide text-ink-faint">Daily email</h2>

        {subscriber ? (
          <>
            <p className="mt-2 font-sans text-sm text-ink-soft">Subscribed — one word a day.</p>
            <form action={unsubscribe} className="mt-3">
              <button
                type="submit"
                className="font-sans text-sm text-ink-faint underline underline-offset-2 transition-colors hover:text-danger cursor-pointer"
              >
                Unsubscribe
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 font-sans text-sm text-ink-soft">Not subscribed yet.</p>
            <form action={subscribe} className="mt-3">
              <button
                type="submit"
                className="rounded-full bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
              >
                Subscribe
              </button>
            </form>
          </>
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
          className="rounded-full border border-line px-4 py-2.5 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
        >
          Sign out
        </button>
      </form>
    </section>
  );
}
