"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { WIDE_DOT } from "@/lib/collection";
import { findSheet } from "@/lib/languages/lookup";
import type { Dot } from "@/lib/languages/mapGeometry";
import {
  mapHeight,
  mapModel,
  panelModel,
  PANEL_WIDTH,
  type FamilyChip,
  type TimelineModel,
} from "@/lib/languages/panel";
import type { LanguageSheet } from "@/lib/languages/types";
import Eyebrow from "@/components/ui/Eyebrow";

const TIMELINE_HEIGHT = 24;
const BASELINE_Y = 16;

/** "About {language}" on Collection. Loaded with next/dynamic from CollectionScreen, so
 * this is the only place the sheets (data.ts, via findSheet) are pulled in; the land dots
 * load only once the map mounts. None of it is in the page's first JS. */
export default function LanguagePanel({
  id,
  name,
  favouriteLineages,
}: {
  id: string;
  name: string; // canonical name from SHEET_NAMES
  favouriteLineages: string[][];
}) {
  const sheet = findSheet(name);
  if (!sheet) return null;
  return <LanguagePanelView id={id} sheet={sheet} favouriteLineages={favouriteLineages} />;
}

export function LanguagePanelView({
  id,
  sheet,
  favouriteLineages,
}: {
  id: string;
  sheet: LanguageSheet;
  favouriteLineages: string[][];
}) {
  const model = useMemo(() => panelModel(sheet, favouriteLineages), [sheet, favouriteLineages]);
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="mt-5 border-b border-line pb-7"
    >
      <Eyebrow as="p" className="tracking-eyebrow-wider text-accent">
        Language
      </Eyebrow>
      <h2
        id={headingId}
        className="mt-1.5 font-serif text-3xl leading-display font-normal tracking-headline"
      >
        {sheet.name}
      </h2>
      <p className="mt-2 font-serif text-base leading-body text-ink-soft italic">
        {sheet.classification}
        {WIDE_DOT}
        {model.statusNote}
      </p>

      <Part title="Where">
        {sheet.map && <DotMap map={sheet.map} name={sheet.name} region={sheet.region} />}
        <p className="mt-2 font-serif text-sm leading-body text-ink-soft italic">{sheet.region}</p>
      </Part>

      <Part title="When">
        {model.timeline ? (
          <Timeline t={model.timeline} />
        ) : (
          <p className="font-serif text-base text-ink-soft italic">Dates unknown</p>
        )}
      </Part>

      <Part title="Speakers">
        {model.speakers.kind === "count" ? (
          <>
            <p className="font-serif text-2xl leading-display">{model.speakers.value}</p>
            <p className="font-sans text-sm text-ink-soft">as of {model.speakers.year}</p>
            {model.speakers.note && (
              <p className="mt-1.5 font-serif text-sm leading-body text-ink-soft italic">
                {model.speakers.note}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-serif text-2xl leading-display">No reliable count</p>
            {model.speakers.note && (
              <p className="mt-1.5 font-serif text-sm leading-body text-ink-soft italic">
                {model.speakers.note}
              </p>
            )}
          </>
        )}
      </Part>

      <Part title="Family path">
        <FamilyPath groups={model.family} />
        {model.showDashedCaption && (
          <p className="mt-2.5 font-serif text-sm text-ink-soft italic">
            Dashed: reconstructed, never written down
          </p>
        )}
        {model.favouriteCount > 0 && (
          <p className="mt-3 font-serif text-base leading-body">
            {model.favouriteCount} of your favourites passed through {sheet.name}
          </p>
        )}
      </Part>

      <Part title="Where it came from">
        <p className="font-serif text-base leading-body [text-wrap:pretty]">{sheet.origin}</p>
        <p className="mt-2 font-sans text-sm text-ink-soft">
          Source:{" "}
          <a
            href={sheet.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Wikipedia
          </a>
        </p>
      </Part>
    </section>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2.5">
        <Eyebrow className="tracking-eyebrow">{title}</Eyebrow>
      </h3>
      {children}
    </div>
  );
}

function DotMap({
  map,
  name,
  region,
}: {
  map: NonNullable<LanguageSheet["map"]>;
  name: string;
  region: string;
}) {
  const [landDots, setLandDots] = useState<Dot[] | null>(null);

  useEffect(() => {
    let current = true;
    import("@/lib/languages/mapDots").then(
      (m) => {
        if (current) setLandDots(m.LAND_DOTS);
      },
      () => {
        // A failed chunk load leaves the empty canvas and the region line.
      }
    );
    return () => {
      current = false;
    };
  }, []);

  const m = useMemo(() => (landDots ? mapModel(map, landDots) : null), [map, landDots]);
  const height = m?.height ?? mapHeight(map);

  return (
    <svg
      role="img"
      aria-label={`Map: the lit area marks where ${name} was spoken — ${region}`}
      viewBox={`0 0 ${PANEL_WIDTH} ${height}`}
      className="block h-auto w-full text-line-strong"
    >
      {m && (
        <>
          {m.dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.lit ? m.litRadius : m.dotRadius}
              fill={d.lit ? "var(--accent)" : "currentColor"}
            />
          ))}
          <circle
            cx={m.centre.x}
            cy={m.centre.y}
            r={m.ringRadius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.25}
          />
        </>
      )}
    </svg>
  );
}

function Timeline({ t }: { t: TimelineModel }) {
  const barY = BASELINE_Y - 6;
  return (
    <div>
      <div className="relative h-5">
        <span
          aria-hidden="true"
          className="absolute top-0 font-sans text-micro tracking-label whitespace-nowrap text-accent"
          style={t.labelAnchor.side === "left" ? { left: `${t.labelAnchor.percent}%` } : { right: `${t.labelAnchor.percent}%` }}
        >
          {t.label}
        </span>
      </div>
      <svg
        role="img"
        aria-label={t.ariaLabel}
        viewBox={`0 0 ${PANEL_WIDTH} ${TIMELINE_HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-6 w-full text-line-strong"
      >
        <line
          x1={0}
          x2={PANEL_WIDTH}
          y1={BASELINE_Y}
          y2={BASELINE_Y}
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={PANEL_WIDTH - 1}
          x2={PANEL_WIDTH - 1}
          y1={4}
          y2={TIMELINE_HEIGHT}
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {t.tail && (
          <rect
            x={t.tail.x}
            y={barY + 2}
            width={t.tail.width}
            height={8}
            fill="var(--accent)"
            opacity={0.35}
          />
        )}
        {t.dashed ? (
          <rect
            x={t.bar.x}
            y={barY}
            width={t.bar.width}
            height={12}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <rect x={t.bar.x} y={barY} width={t.bar.width} height={12} fill="var(--accent)" />
        )}
      </svg>
      <div className="relative mt-1 h-4 font-sans text-micro tracking-label text-ink-soft" aria-hidden="true">
        {t.ticks.map((tick) => (
          <span key={tick.label} className="absolute top-0 whitespace-nowrap" style={{ left: `${tick.percent}%` }}>
            {tick.label}
          </span>
        ))}
        <span className="absolute top-0 right-0">now</span>
      </div>
    </div>
  );
}

function FamilyPath({ groups }: { groups: FamilyChip[][] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Family path, oldest first">
      {groups.map((group, i) => (
        <Fragment key={group.map((c) => c.name).join("|")}>
          {i > 0 && (
            <li aria-hidden="true" className="font-sans text-micro text-ink-soft">
              ›
            </li>
          )}
          <li className="flex flex-wrap gap-1.5">
            {group.map((c) => (
              <span
                key={c.name}
                aria-current={c.current ? "true" : undefined}
                className={clsx(
                  "rounded-full border px-2.25 py-1.25 font-sans text-micro tracking-label",
                  c.current ? "border-accent text-accent" : "border-line-strong text-ink-soft",
                  c.reconstructed && "border-dashed"
                )}
              >
                {c.name}
              </span>
            ))}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
