import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeInit from "@/components/ThemeInit";
import AccountFavoritesSync from "@/components/AccountFavoritesSync";
import { auth } from "@/lib/auth";
// Self-hosted (not next/font/google) so the app builds without reaching
// fonts.googleapis.com at build time — works the same in dev, CI, and prod.
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "./globals.css";

// Same env var lib/email.ts already uses for absolute links in emails.
// Without metadataBase, Next.js resolves the OG image routes' relative URLs
// against http://localhost:3000 in every environment — including
// production — which would silently break link previews everywhere.
const SITE_URL = process.env.CURIO_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Curio — one word, one story, every day",
  description:
    "A daily word's origin story, delivered once a day. No feed, no firehose — just one word.",
  openGraph: {
    type: "website",
    siteName: "Curio",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Feeding SessionProvider a server-resolved session means useSession()
  // never has to pass through a transient "loading" state on a cold load —
  // without this, lib/useShowArrival.ts had to specifically guard against
  // that state being mistaken for "signed out" (see its doc comment). This
  // removes the underlying flash instead of just working around it.
  const session = await auth();

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeInit />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <SessionProvider session={session}>
          <Header />
          <AccountFavoritesSync />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
