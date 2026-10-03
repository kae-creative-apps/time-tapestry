import type { Metadata } from "next";
import Link from "next/link";
import { BrandArtwork } from "@/components/BrandArtwork";
import { Logo } from "@/components/Logo";
import { BRAND_COLORS } from "@/lib/brand-art";
export const metadata: Metadata = { title: "Time Tapestry | Brand kit", robots: { index: false, follow: false } };
export default function BrandKit() {
  return <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
    <header className="flex items-center justify-between gap-5"><Logo /><Link href="/" className="inline-flex items-center text-sm underline underline-offset-4">Back to the app</Link></header>
    <div className="my-12 max-w-2xl"><p className="mb-4 text-sm text-taupe-600">Time Tapestry brand kit</p><h1 className="font-display text-4xl font-semibold sm:text-5xl">One mark. One family of letterforms.</h1><p className="mt-5 text-lg leading-relaxed text-ink-500">The interwoven icon and repeated lowercase t connect the wordmark to the same idea. Every version below comes from one vector source.</p></div>
    <section aria-label="Logo versions" className="grid gap-4 md:grid-cols-2">
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-warmgray-200 bg-white p-10"><BrandArtwork className="w-full max-w-sm text-espresso" /></div>
      <div className="flex min-h-72 items-center justify-center rounded-2xl bg-espresso p-10"><BrandArtwork className="w-full max-w-sm text-white" /></div>
      <div className="flex min-h-64 items-center justify-center rounded-2xl bg-sage p-10"><BrandArtwork variant="mark" className="h-40 w-40 text-white" /></div>
      <div className="flex min-h-64 items-center justify-center rounded-2xl bg-clay-100 p-10"><BrandArtwork variant="wordmark" className="w-full max-w-xs text-espresso" /></div>
    </section>
    <section className="mt-12" aria-label="Brand colors"><h2 className="mb-5 text-2xl font-semibold">The palette</h2><div className="grid grid-cols-2 gap-4 sm:grid-cols-5">{Object.entries(BRAND_COLORS).map(([name,color])=><div key={name}><div className="mb-3 h-24 rounded-xl border border-warmgray-200" style={{background:color}} /><p className="capitalize">{name}</p><p className="font-mono text-sm text-ink-500">{color}</p></div>)}</div><p className="mt-5 text-sm text-ink-500">Espresso for readable text and primary actions. Sage and clay for supporting surfaces. White space keeps the stories in focus.</p></section>
    <section className="my-12"><h2 className="mb-5 text-2xl font-semibold">Download the matching files</h2><div className="flex flex-wrap gap-3">{["lockup","wordmark","mark"].map(variant=><div key={variant} className="rounded-xl border border-warmgray-200 bg-white px-5 py-4"><p className="mb-2 font-semibold capitalize">{variant}</p><div className="flex gap-5"><a download href={`/brand/time-tapestry-${variant}.svg`} className="inline-flex items-center underline">SVG</a><a download href={`/brand/time-tapestry-${variant}.png`} className="inline-flex items-center underline">PNG</a><a download href={`/brand/time-tapestry-${variant}-light.svg`} className="inline-flex items-center underline">White SVG</a></div></div>)}</div></section>
  </main>;
}
