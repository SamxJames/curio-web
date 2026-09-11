import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { UpstashRedisAdapter } from "@auth/upstash-redis-adapter";
import { redis, usingUpstash } from "./redis";
import { recordUserJoined } from "./userData";

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
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: usingUpstash ? UpstashRedisAdapter(redis!, { baseKeyPrefix: "curio:auth:" }) : undefined,
  session: { strategy: "database" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.CURIO_FROM_EMAIL ?? "Curio <onboarding@resend.dev>",
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
