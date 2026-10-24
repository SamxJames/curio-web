/** The line under every email offer (the form and the signed-in one-tap):
 * what you get, and a sample to look at first. Its own file so both
 * EmailSignupInline and SignupOffer can import it without a cycle. */
export default function SignupPromise() {
  return (
    <p className="mt-2 font-sans text-xs text-ink-faint">
      One short email each morning. Free; stop anytime.{" "}
      <a href="/sample-email" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink-soft">
        See a sample &rarr;
      </a>
    </p>
  );
}
