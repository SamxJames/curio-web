import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "@/lib/db";
import Button from "@/components/ui/Button";

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
              <Button variant="link" type="submit" className="text-sm hover:!text-danger">
                Unsubscribe
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 font-sans text-sm text-ink-soft">Not subscribed yet.</p>
            <form action={subscribe} className="mt-3">
              <Button type="submit">
                Subscribe
              </Button>
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
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </section>
  );
}
