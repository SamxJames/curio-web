import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { UpstashRedisAdapter } from "@auth/upstash-redis-adapter";
import { redis, usingUpstash } from "./redis";
import { recordUserJoined } from "./userData";
import { sendSignInEmail } from "./email";

// Auth.js's default Session type doesn't carry `id` — every page/route in
// this app needs it, so it's added by the session callback below and the
// type is widened to match here.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/** Accounts require Upstash Redis (the adapter has nowhere else to persist
 * users/sessions). Without it configured, auth() always resolves to no
 * session and any sign-in attempt fails with a clear Auth.js configuration
 * error — the rest of the app (anonymous browsing, email subscribe) keeps
 * working exactly as before, matching lib/db.ts's local-fallback behavior. */
const adapter = usingUpstash
  ? UpstashRedisAdapter(redis!, { baseKeyPrefix: "curio:auth:" })
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "database" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Resend({
      // Overrides the provider's built-in sendVerificationRequest (a generic
      // "click here to sign in" template that's both off-brand and a known
      // spam signal on its own) with Curio's own branded email — see
      // sendSignInEmail's doc comment in lib/email.ts.
      async sendVerificationRequest({ identifier: email, url }) {
        await sendSignInEmail(email, url);
      },
    }),
  ],
  callbacks: {
    // Reproduces the default callback's field selection exactly (see the
    // comment above), plus `id` — deliberately not `...session`, since the
    // raw database session also carries the session token itself.
    session({ session, user }) {
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
        expires: session.expires?.toISOString?.() ?? session.expires,
      };
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) await recordUserJoined(user.id);
    },
  },
});

/** Looks up the signed-in account (if any) tied to an email address, so the
 * daily-digest cron can personalize an otherwise-anonymous subscriber's word
 * — see lib/words.ts's getDigestWordForSubscriber. Returns null when Upstash
 * isn't configured (no adapter to query) or no account matches. */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const user = await adapter?.getUserByEmail?.(email);
  return user?.id ?? null;
}
