import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LanguagePanelView from "@/components/LanguagePanelView";
import { panelModel } from "@/lib/languages/panel";
import {
  familyLinks,
  findLanguagePage,
  languageDescription,
  languagePages,
  type FamilyLink,
} from "@/lib/languages/pages";
import { buildLanguageJsonLd, serializeJsonLd } from "@/lib/storyJsonLd";

// Only the derived set; anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return languagePages().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findLanguagePage(slug);
  if (!page) return {};
  const title = `Words from ${page.name}: English words with ${page.name} origins | Curio`;
  const description = languageDescription(page);
  return {
    title,
    description,
    alternates: { canonical: `/language/${slug}` },
    openGraph: { type: "website", siteName: "Curio", title, description, url: `/language/${slug}` },
  };
}

const linkClass = "text-ink transition-colors hover:text-accent";

function Name({ link }: { link: FamilyLink }) {
  return link.href ? (
    <Link href={link.href} prefetch={false} className={linkClass}>
      {link.name}
    </Link>
  ) : (
    <>{link.name}</>
  );
}

// Static and public: nothing here reads cookies, headers, Redis or the reader's
// favourites (archive, never backlog: a public total only).
export default async function LanguagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findLanguagePage(slug);
  if (!page) notFound();

  const { name, sheet, words } = page;
  // Family path "next languages" come from this page's words, not anyone's favourites.
  const model = panelModel(sheet, words.map((w) => w.lineage));
  const family = familyLinks(page);

  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildLanguageJsonLd(page)) }}
      />
      <h1 className="font-serif text-4xl leading-display">Words from {name}</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        {words.length} words in Curio passed through {name} on their way into English.
      </p>

      <LanguagePanelView id="about" sheet={sheet} model={model} variant="page" />

      {(family.parent || family.children.length > 0) && (
        <section aria-labelledby="family-heading" className="mt-10">
          <h2 id="family-heading" className="font-serif text-2xl leading-display">
            Family
          </h2>
          {family.parent && (
            <p className="mt-3 font-serif text-base leading-body text-ink-soft">
              {name} grew out of <Name link={family.parent} />.
            </p>
          )}
          {family.children.length > 0 && (
            <p className="mt-2 font-serif text-base leading-body text-ink-soft">
              Languages that grew out of {name}:{" "}
              {family.children.map((c, i) => (
                <Fragment key={c.name}>
                  {i > 0 && ", "}
                  <Name link={c} />
                </Fragment>
              ))}
              .
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="words-heading" className="mt-10">
        <h2 id="words-heading" className="font-serif text-2xl leading-display">
          The words, A to Z
        </h2>
        <ul className="mt-4">
          {words.map((w) => (
            <li key={w.slug} className="border-b border-line py-3">
              {/* prefetch={false}: up to 560 links on one page (see app/words/page.tsx). */}
              <Link href={`/story/${w.slug}`} prefetch={false} className={`font-serif text-lg ${linkClass}`}>
                {w.word}
              </Link>
              <p className="mt-1 font-serif text-sm leading-body text-ink-soft">{w.teaser}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
