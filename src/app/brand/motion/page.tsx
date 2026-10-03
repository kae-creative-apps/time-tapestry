import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MotionPreview } from "./MotionPreview";

export const metadata: Metadata = {
  title: "Time Tapestry | Motion and sound",
  robots: { index: false, follow: false },
};

export default function MotionPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-7 sm:px-10 sm:py-10">
      <header className="flex items-center justify-between gap-5">
        <Logo />
        <Link
          href="/brand"
          className="inline-flex items-center text-base underline underline-offset-4"
        >
          Back to the brand kit
        </Link>
      </header>
      <div className="mb-8 mt-10 max-w-2xl">
        <p className="brand-eyebrow mb-3 text-taupe-600">Motion and sound</p>
        <h1 className="font-display text-4xl font-medium sm:text-5xl">
          The interview, in motion.
        </h1>
        <p className="mt-4 text-lg leading-8 text-ink-500">
          A preview of the interview orb in our colors, with a soft sound to
          mark the beginning.
        </p>
      </div>
      <MotionPreview />
      <p className="mt-6 text-sm leading-6 text-ink-500">
        Siri Orb by{" "}
        <a
          href="https://21st.dev/@educalvolpz/components/siri-orb"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4"
        >
          Edu Calvo / SmoothUI
        </a>
        , customized for Time Tapestry. Motion follows your device&apos;s
        reduced motion setting.
      </p>
    </main>
  );
}
