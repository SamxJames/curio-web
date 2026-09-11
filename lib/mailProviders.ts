export type MailProvider = { label: string; url: string; domains: string[] };

/** Common webmail providers, matched by the domain of the email address just
 * submitted — lets the "check your email" screen link straight to the
 * right inbox instead of leaving people to go find it themselves. */
export const MAIL_PROVIDERS: MailProvider[] = [
  { label: "Gmail", url: "https://mail.google.com/mail/u/0/", domains: ["gmail.com", "googlemail.com"] },
  {
    label: "Outlook",
    url: "https://outlook.live.com/mail/0/inbox",
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
  },
  { label: "Yahoo Mail", url: "https://mail.yahoo.com/", domains: ["yahoo.com", "yahoo.co.uk", "ymail.com"] },
  { label: "iCloud Mail", url: "https://www.icloud.com/mail", domains: ["icloud.com", "me.com", "mac.com"] },
];

/** The provider matching an email's domain, if it's one of the common ones —
 * used to highlight the right inbox link first. */
export function detectMailProvider(email: string): MailProvider | undefined {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  return MAIL_PROVIDERS.find((p) => p.domains.includes(domain));
}
