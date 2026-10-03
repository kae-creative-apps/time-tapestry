import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Interface icons | Time Tapestry",
  robots: { index: false, follow: false },
};

const samples = [
  { name: "conversation", label: "Conversation" },
  { name: "collection", label: "Story collection" },
  { name: "postcard", label: "Postcard" },
  { name: "video", label: "Video" },
  { name: "pause", label: "Pause" },
  { name: "play", label: "Play" },
  { name: "check", label: "Confirmed" },
  { name: "arrowRight", label: "Continue" },
  { name: "arrowUpRight", label: "Open" },
  { name: "shield", label: "Privacy" },
  { name: "edit", label: "Edit" },
  { name: "download", label: "Download" },
  { name: "heart", label: "Connection" },
  { name: "handHeart", label: "Generosity" },
  { name: "sprout", label: "Growth" },
  { name: "address", label: "Mailing address" },
] satisfies { name: AppIconName; label: string }[];

export default function IconLibraryPage() {
  return (
    <main className="brand-page-shell mx-auto max-w-6xl px-5 py-8 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <Logo className="[&_svg]:h-11" />
        <Link
          href="/brand"
          className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
        >
          Back to the brand kit
          <AppIcon name="arrowRight" size={18} />
        </Link>
      </header>

      <section className="my-10 rounded-2xl bg-sage-100 p-7 sm:my-12 sm:p-10">
        <p className="brand-eyebrow text-espresso">
          Time Tapestry / Interface icons
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl sm:text-5xl">
          Clear signs for every step.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-500">
          A small set of rounded line icons for conversations, stories and
          postcards. Shared shapes, weight and spacing keep each action
          familiar.
        </p>
        <a
          href="https://lucide.dev/"
          className="mt-5 inline-flex items-center gap-2 text-sm underline underline-offset-4"
        >
          Icons by Lucide
          <AppIcon name="arrowUpRight" size={18} />
        </a>
      </section>

      <section
        aria-label="The three parts of the gift"
        className="grid gap-4 sm:grid-cols-3"
      >
        {(
          [
            ["conversation", "A conversation", "bg-sage-100 text-espresso"],
            ["collection", "A story collection", "bg-clay-100 text-espresso"],
            ["postcard", "A postcard", "brand-gradient-chocolate text-white"],
          ] as const
        ).map(([name, label, colors]) => (
          <div
            key={name}
            className={`flex min-h-48 flex-col items-center justify-center gap-5 rounded-2xl p-8 ${colors}`}
          >
            <AppIcon name={name} size={40} />
            <p className="font-display text-xl font-semibold">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-12" aria-labelledby="icon-library-heading">
        <h2 id="icon-library-heading" className="mb-6 text-2xl">
          The icon library
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {samples.map(({ name, label }) => (
            <div
              key={name}
              className="rounded-xl border border-warmgray-200 bg-white p-5 sm:p-6"
            >
              <AppIcon name={name} size={28} className="mb-5 text-espresso" />
              <p className="font-medium">{label}</p>
              <p className="mt-1 font-mono text-xs text-ink-500">{name}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="my-12 grid gap-7 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-9 md:grid-cols-2"
        aria-labelledby="icon-sizing-heading"
      >
        <div>
          <h2 id="icon-sizing-heading" className="text-2xl">
            One consistent weight
          </h2>
          <p className="mt-4 leading-relaxed text-ink-500">
            Use 20 pixels in compact controls, 24 pixels beside text and 32
            pixels in feature cards. The default stroke is 1.75, with rounded
            ends.
          </p>
          <div className="mt-7 flex items-end gap-8">
            {[20, 24, 32, 40].map((size) => (
              <div key={size} className="flex flex-col items-center gap-3">
                <AppIcon name="conversation" size={size} />
                <span className="text-xs text-ink-500">{size}px</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-clay-50 p-6">
          <h3 className="text-xl">Keep the meaning in the label</h3>
          <p className="mt-4 leading-relaxed text-ink-500">
            Pair icons with clear words. Icons beside text stay decorative. Give
            an icon-only button an accessible name, and label any icon that
            carries meaning on its own.
          </p>
          <div className="mt-5 inline-flex items-center gap-3 rounded-md border border-clay-100 bg-white px-4 py-3">
            <AppIcon name="check" className="text-forest" />
            <span>Address confirmed</span>
          </div>
        </div>
      </section>
    </main>
  );
}
