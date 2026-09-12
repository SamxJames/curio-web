export type MailProvider = {
  label: string;
  url: string;
  domains: string[];
  /** Custom URL scheme that opens the provider's native app directly, where
   * one exists for that platform. There's no public scheme for every
   * provider/platform combination, so these are best-effort. */
  iosScheme?: string;
  androidScheme?: string;
};

/** Common webmail providers, matched by the domain of the email address just
 * submitted — lets the "check your email" screen link straight to the
 * right inbox instead of leaving people to go find it themselves. */
export const MAIL_PROVIDERS: MailProvider[] = [
  {
    label: "Gmail",
    url: "https://mail.google.com/mail/u/0/",
    domains: ["gmail.com", "googlemail.com"],
    iosScheme: "googlegmail://",
    androidScheme: "googlegmail://",
  },
  {
    label: "Outlook",
    url: "https://outlook.live.com/mail/0/inbox",
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    iosScheme: "ms-outlook://",
    androidScheme: "ms-outlook://",
  },
  {
    label: "Yahoo Mail",
    url: "https://mail.yahoo.com/",
    domains: ["yahoo.com", "yahoo.co.uk", "ymail.com"],
    iosScheme: "ymail://",
  },
  {
    label: "iCloud Mail",
    url: "https://www.icloud.com/mail",
    domains: ["icloud.com", "me.com", "mac.com"],
    // No iCloud-specific scheme — iCloud Mail is handled by Apple's own
    // Mail app, whose generic scheme is "message://".
    iosScheme: "message://",
  },
];

/** The provider matching an email's domain, if it's one of the common ones —
 * used to highlight the right inbox link first. */
export function detectMailProvider(email: string): MailProvider | undefined {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  return MAIL_PROVIDERS.find((p) => p.domains.includes(domain));
}

function nativeScheme(provider: MailProvider): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return provider.iosScheme;
  if (/Android/i.test(ua)) return provider.androidScheme;
  return undefined;
}

/** Opens a mail provider's inbox. On a phone with a matching native app
 * scheme, tries the app first and falls back to the website — there's no
 * reliable way to detect whether the app is actually installed up front, so
 * this fires the scheme, watches whether the tab gets backgrounded (a sign
 * the OS handed off to the app), and opens the website itself if nothing
 * happened within a second or so. Everywhere else, it just opens the
 * website directly. */
export function openMailProvider(provider: MailProvider): void {
  const scheme = nativeScheme(provider);
  if (!scheme) {
    window.open(provider.url, "_blank", "noopener,noreferrer");
    return;
  }

  let leftPage = false;
  const onVisibilityChange = () => {
    if (document.hidden) leftPage = true;
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  window.location.href = scheme;

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!leftPage) {
      window.open(provider.url, "_blank", "noopener,noreferrer");
    }
  }, 1200);
}
