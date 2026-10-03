import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BrandArtwork } from "@/components/BrandArtwork";
import { StoryMorphVisual } from "@/components/marketing/StoryMorphHero";
import { WovenHero } from "@/components/marketing/WovenHero";
import { BrandGrain } from "@/components/brand/BrandGrain";
import { ThreadAssembly } from "@/components/brand/ThreadAssembly";
import { InterviewPreview } from "@/components/marketing/InterviewPreview";
import styles from "@/components/brand/brand-motion.module.css";

export const metadata: Metadata = {
  title: "Time Tapestry | A thread through everything",
  description:
    "A working brand motion board and presentation concept for Time Tapestry.",
  robots: { index: false, follow: false },
};

export default function BrandDesignPage() {
  return (
    <main className="mx-auto max-w-[1360px] px-5 pb-16 pt-7 sm:px-10 sm:pt-10">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-warmgray-200 pb-7">
        <Logo />
        <nav
          aria-label="Brand previews"
          className="flex flex-wrap items-center gap-5 text-sm font-medium text-ink-500"
        >
          <Link
            href="/brand"
            className="min-h-11 content-center underline decoration-warmgray-300 underline-offset-4"
          >
            Brand kit
          </Link>
          <Link
            href="/brand/motion"
            className="min-h-11 content-center underline decoration-warmgray-300 underline-offset-4"
          >
            Voice and sound
          </Link>
          <Link
            href="/"
            className="min-h-11 content-center underline decoration-warmgray-300 underline-offset-4"
          >
            See the website
          </Link>
        </nav>
      </header>

      <div className="flex flex-col justify-between gap-6 pb-10 pt-12 sm:pt-16 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="brand-eyebrow mb-4 text-ink-500">
            Brand motion · working direction
          </p>
          <h1 className="font-display text-[clamp(36px,4.3vw,58px)] font-medium leading-[1.08] tracking-[-.045em]">
            A thread through everything.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-500">
            A little movement to invite a conversation. A texture that feels
            familiar. The same woven story, from the first visit to the gift
            they keep.
          </p>
        </div>
        <a
          href="#where-it-belongs"
          className="inline-flex min-h-12 shrink-0 items-center justify-center self-start rounded-full border border-warmgray-300 bg-white px-6 text-sm font-medium text-espresso lg:self-auto"
        >
          See where each detail belongs ↓
        </a>
      </div>

      <ThreadAssembly />

      <section
        id="where-it-belongs"
        className="mt-20 scroll-mt-8"
        aria-labelledby="motion-usage-title"
      >
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="brand-eyebrow mb-3 text-ink-500">
              Four details, each with a purpose
            </p>
            <h2
              id="motion-usage-title"
              className="text-3xl font-medium sm:text-4xl"
            >
              Where the brand comes to life.
            </h2>
          </div>
          <p className="max-w-sm text-base leading-7 text-ink-500">
            Soft motion at the invitation. Quiet space for the story.
          </p>
        </div>
        <div className="grid gap-x-7 gap-y-10 md:grid-cols-2">
          <article>
            <div className={`${styles.usageVisual} bg-espresso`}>
              <StoryMorphVisual className="!w-[280px]" />
              <div className="absolute bottom-3 left-3 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-espresso">
                Main website direction
              </div>
            </div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-xs text-ink-500">01</span>
              <h3 className="text-2xl font-medium">The gift comes first.</h3>
            </div>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink-500">
              The stacked gift cards lead the website. Their arrival brings the
              four stories into view and makes the keepsake tangible before
              someone starts an interview.
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
            >
              Open the stacked card hero ↗
            </Link>
          </article>

          <article>
            <div className={styles.usageVisual}>
              <BrandGrain tone="sage" />
              <div className="mx-5 w-full max-w-[320px] rounded-lg border border-white/60 bg-paper px-7 py-6 shadow-soft">
                <p className="brand-eyebrow text-ink-500">A story to keep</p>
                <p className="mt-3 font-display text-2xl font-medium leading-tight text-espresso">
                  The kindness
                  <br />
                  that stayed with me.
                </p>
                <div className="mt-5 h-px w-12 bg-clay" />
              </div>
            </div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-xs text-ink-500">02</span>
              <h3 className="text-2xl font-medium">A warmth you can feel.</h3>
            </div>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink-500">
              Use the grain on story dividers and pitch backgrounds. It stays
              still, while a solid paper surface keeps every word clear.
            </p>
            <p className="mt-3 text-sm leading-6 text-ink-500">
              Shown here: a sample story title on the sage grain.
            </p>
          </article>

          <article>
            <div className={styles.usageVisual}>
              <BrandGrain tone="espresso" />
              <div className="flex flex-col items-center gap-6 px-5 text-center text-white">
                <p className="font-display text-2xl font-medium text-white">
                  Hear how a story begins.
                </p>
                <InterviewPreview />
              </div>
            </div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-xs text-ink-500">03</span>
              <h3 className="text-2xl font-medium">An invitation to listen.</h3>
            </div>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink-500">
              A fine thread of light moves around the interview preview once,
              then rests. The sound begins only when someone chooses to listen.
            </p>
            <p className="mt-3 text-sm leading-6 text-ink-500">
              This is the working interview preview, with the new border.
            </p>
          </article>

          <article>
            <div className={`${styles.usageVisual} bg-clay-50`}>
              <BrandGrain tone="clay" />
              <div className="flex w-full items-center px-8" aria-hidden="true">
                <svg viewBox="0 0 320 150" fill="none" className="w-2/3">
                  <path
                    d="M0 20C145 20 135 57 320 57"
                    stroke="#756454"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0 57C135 57 145 69 320 69"
                    stroke="#939480"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0 94C150 94 130 81 320 81"
                    stroke="#92664f"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0 131C140 131 140 93 320 93"
                    stroke="#fbfaf8"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex aspect-square w-1/3 items-center justify-center rounded-lg bg-paper shadow-soft">
                  <BrandArtwork
                    variant="mark"
                    className="h-14 w-14 text-espresso"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-xs text-ink-500">04</span>
              <h3 className="text-2xl font-medium">Many moments. One story.</h3>
            </div>
            <p className="mt-3 max-w-xl text-base leading-7 text-ink-500">
              Let the four threads gather on a pitch slide or a future
              collection reveal. It shows how separate memories become a gift
              with meaning.
            </p>
            <p className="mt-3 text-sm leading-6 text-ink-500">
              Prototype above. This does not signal that a film or collection is
              ready.
            </p>
          </article>
        </div>
      </section>

      <section
        className="mt-16 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8"
        aria-labelledby="fabric-experiment-title"
      >
        <p className="brand-eyebrow mb-3 text-ink-500">Optional exploration</p>
        <h2
          id="fabric-experiment-title"
          className="text-2xl font-medium sm:text-3xl"
        >
          Keep the fabric idea here.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink-500">
          A separate texture experiment for a future brand moment. The homepage
          uses the stacked gift cards.
        </p>
        <details className="mt-5">
          <summary className="min-h-12 cursor-pointer content-center text-base font-medium underline underline-offset-4">
            Open the fabric experiment
          </summary>
          <div className="mt-5 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div className="overflow-hidden rounded-xl bg-espresso">
              <WovenHero className="!h-[320px]" />
            </div>
            <p className="max-w-sm text-sm leading-7 text-ink-500">
              Move your pointer across the fabric to explore it. Touch screens
              and reduced-motion settings show the still artwork. This
              experiment is kept off the main website experience.
            </p>
          </div>
        </details>
      </section>

      <footer className="mt-16 grid gap-6 border-t border-warmgray-200 pt-7 text-sm leading-6 text-ink-500 sm:grid-cols-[1.15fr_1fr]">
        <p>
          The approved mark and palette stay consistent. The border and story
          reveal each settle after one pass. Reduced motion keeps the
          composition still, and no sound plays automatically.
        </p>
        <p>
          Motion references: MagicUI Shine Border, the{" "}
          <a
            href="https://21st.dev/community/gradients/editor?from=dc893a4f-0b29-4732-9b29-d4de9c0b70ee"
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            Almoayyed gradient recipe
          </a>
          , and Grid Pulse from{" "}
          <a
            href="https://21st.dev/community/components"
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            21st Dev
          </a>
          . Each is adapted to Time Tapestry.
        </p>
      </footer>
    </main>
  );
}
