import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeInit from "@/components/ThemeInit";
import AccountFavoritesSync from "@/components/AccountFavoritesSync";
// Self-hosted (not next/font/google) so the app builds without reaching
// fonts.googleapis.com at build time — works the same in dev, CI, and prod.
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Curio — one word, one story, every day",
  description:
    "A daily word's origin story, delivered once a day. No feed, no firehose — just one word.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
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
      </body>
    </html>
  );
}
