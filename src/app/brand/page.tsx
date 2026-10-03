import type { Metadata } from "next";
import Link from "next/link";
import { BrandArtwork } from "@/components/BrandArtwork";
import { BrandPattern } from "@/components/BrandPattern";
import { Logo } from "@/components/Logo";
import { BRAND_COLORS } from "@/lib/brand-art";
export const metadata: Metadata = {
  title: "Time Tapestry | Brand kit",
  robots: { index: false, follow: false },
};
export default function BrandKit() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-7 sm:px-10 sm:py-10">
      <header className="flex items-center justify-between gap-5">
        <Logo />
        <Link
          href="/"
          className="inline-flex items-center text-sm underline underline-offset-4"
        >
          Back to the app
        </Link>
      </header>
      <div className="my-12 max-w-2xl">
        <p className="brand-eyebrow mb-4 text-taupe-600">
          The Time Tapestry identity
        </p>
        <h1 className="font-display text-4xl font-medium sm:text-5xl">
          Stories woven together.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-500">
          Warm color, considered lettering and a woven thread that connects the
          whole experience.
        </p>
      </div>
      <section
        aria-label="Logo versions"
        className="grid overflow-hidden rounded-[28px] border border-warmgray-200 md:grid-cols-2"
      >
        <div className="brand-gradient-chocolate flex min-h-80 flex-col items-center justify-center p-10 text-white">
          <BrandArtwork variant="wordmark" className="w-full max-w-[280px]" />
          <p className="mt-5 text-base text-paper">Stories woven together</p>
        </div>
        <div className="flex min-h-80 items-center justify-center bg-white p-10">
          <BrandArtwork variant="mark" className="h-44 w-44 text-espresso" />
        </div>
        <div className="brand-gradient-sage flex min-h-64 items-center justify-center p-10">
          <BrandArtwork className="w-full max-w-sm text-white" />
        </div>
        <div className="brand-gradient-clay flex min-h-64 items-center justify-center p-10">
          <BrandArtwork className="w-full max-w-sm text-espresso" />
        </div>
      </section>
      <section aria-label="Woven brand patterns" className="mt-14">
        <p className="brand-eyebrow mb-3 text-taupe-600">
          A thread through everything
        </p>
        <h2 className="mb-6 text-3xl font-medium">The woven patterns</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="overflow-hidden rounded-2xl border border-warmgray-200 bg-paper">
              <BrandPattern
                variant="ribbon"
                className="aspect-[5/3] w-full text-espresso"
              />
            </div>
            <p className="mt-4 font-medium">Repeating ribbon</p>
            <p className="mt-1 text-sm text-ink-500">
              For packaging, postcard details and cropped brand panels.
            </p>
          </div>
          <div>
            <div className="overflow-hidden rounded-2xl border border-warmgray-200 bg-paper">
              <BrandPattern
                variant="weave"
                className="aspect-[5/3] w-full text-espresso"
              />
            </div>
            <p className="mt-4 font-medium">The interwoven thread</p>
            <p className="mt-1 text-sm text-ink-500">
              A larger gesture in sage and chocolate, with room to breathe.
            </p>
          </div>
        </div>
      </section>
      <section className="mt-14" aria-label="Brand colors">
        <h2 className="mb-6 text-3xl font-medium">The palette</h2>
        <div className="grid grid-cols-3 gap-5 sm:grid-cols-5">
          {Object.entries(BRAND_COLORS).map(([name, color]) => (
            <div key={name}>
              <div
                className="mb-4 aspect-square max-h-36 rounded-full border border-warmgray-200"
                style={{ background: color }}
              />
              <p className="capitalize">{name}</p>
              <p className="font-mono text-sm text-ink-500">{color}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl leading-relaxed text-ink-500">
          Espresso anchors the identity. Sage and clay bring warmth. Gradients
          belong on brand panels, with clean surfaces behind stories and
          controls.
        </p>
      </section>
      <section className="my-14">
        <h2 className="mb-6 text-3xl font-medium">The working library</h2>
        <Link href="/brand/icons" className="brand-button-secondary mb-6">
          Explore the Lucide icon library ↗
        </Link>
        <Link
          href="/brand/motion"
          className="brand-button-secondary mb-6 sm:ml-3"
        >
          Preview the voice orb and sound ↗
        </Link>
        <div className="grid gap-3 sm:grid-cols-3">
          {["lockup", "wordmark", "mark", "ribbon", "weave"].map((variant) => (
            <div
              key={variant}
              className="rounded-xl border border-warmgray-200 bg-white px-5 py-4"
            >
              <p className="mb-2 font-medium capitalize">{variant}</p>
              <div className="flex gap-5">
                <a
                  download
                  href={`/brand/time-tapestry-${variant}.svg`}
                  className="inline-flex items-center text-sm underline"
                >
                  SVG
                </a>
                <a
                  download
                  href={`/brand/time-tapestry-${variant}.png`}
                  className="inline-flex items-center text-sm underline"
                >
                  PNG
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
