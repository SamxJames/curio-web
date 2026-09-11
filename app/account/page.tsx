import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getSubscriberByEmail } from "@/lib/db";

export const metadata = { title: "Account — Curio" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subscriber = session.user.email
    ? await getSubscriberByEmail(session.user.email)
    : null;

  return (
    <section className="mx-auto max-w-[440px] px-6 py-20">
      <h1 className="font-serif text-3xl">Account</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">{session.user.email}</p>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="font-sans text-xs tracking-wide text-ink-faint">Daily email</h2>
        <p className="mt-2 font-sans text-sm text-ink-soft">
          {subscriber
            ? `Subscribed — delivered at ${subscriber.hour}:00 UTC.`
            : "Not subscribed. Sign up from the homepage to get it by email."}
        </p>
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
