import { Resend } from "resend";
import type { WordEntry } from "./words";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.CURIO_FROM_EMAIL ?? "Curio <word@curio.example>";
const SITE_URL = process.env.CURIO_SITE_URL ?? "http://localhost:3000";

/** Not cryptographically secure — good enough to keep an unsubscribe link
 * from being casually guessed for a v1. Swap for a signed (HMAC) token
 * before relying on this for anything sensitive. */
export function unsubscribeToken(email: string): string {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

export function decodeUnsubscribeToken(token: string): string {
  return Buffer.from(token, "base64url").toString("utf-8");
}

function buildHtml(word: WordEntry, dateStr: string, unsubscribeUrl: string) {
  const storyUrl = `${SITE_URL}/story/${word.slug}`;
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f1ece0;font-family:Georgia,'Times New Roman',serif;color:#24302b;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.02em;color:#5b665f;margin:0 0 24px;">
        Curio &middot; ${dateStr}
      </p>
      <h1 style="font-size:36px;line-height:1.1;margin:0 0 4px;font-weight:600;">
        ${word.word}
      </h1>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a9089;margin:0 0 24px;">
        ${word.respelling} &middot; ${word.partOfSpeech}
      </p>
      <p style="font-size:17px;line-height:1.55;margin:0 0 28px;">
        ${word.origin}
      </p>
      <a href="${storyUrl}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#7a4f1e;text-decoration:none;border-bottom:1px solid #7a4f1e;padding-bottom:2px;">
        Read the full story &rarr;
      </a>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a9089;margin-top:48px;border-top:1px solid #d8cfbc;padding-top:16px;">
        One word, once a day.
        <a href="${unsubscribeUrl}" style="color:#8a9089;">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}

export async function sendDailyDigest(email: string, word: WordEntry, date: Date) {
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${unsubscribeToken(email)}`;
  const html = buildHtml(word, dateStr, unsubscribeUrl);
  const subject = `${word.word} — today's word from Curio`;

  if (!resend) {
    // Local/dev fallback: no RESEND_API_KEY configured, so log instead of sending.
    console.log(`[curio:email:dev-fallback] would send "${subject}" to ${email}`);
    return { id: "dev-fallback", sent: false as const };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject,
    html,
  });

  if (error) throw new Error(`Resend send failed: ${error.message}`);
  return { id: data?.id, sent: true as const };
}
