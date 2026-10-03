import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Footer } from "@/components/Footer";
import { SiriOrb } from "@/components/ui/siri-orb";
import { PostcardPreview } from "@/components/marketing/PostcardPreview";
import { StoryMorphVisual } from "@/components/marketing/StoryMorphHero";

const storyThemes = [
  {
    title: "The kindness I received",
    note: "The people who helped shape you.",
    color: "bg-sage-100",
    icon: "heart",
  },
  {
    title: "My walk with Jesus",
    note: "The faith you lived along the way.",
    color: "bg-clay-50",
    icon: "sprout",
  },
  {
    title: "What I sowed",
    note: "The time and money you gave, and why.",
    color: "bg-paper-200",
    icon: "handHeart",
  },
  {
    title: "What I hope you carry",
    note: "Your words for the life ahead of them.",
    color: "bg-[#eee4dc]",
    icon: "collection",
  },
] satisfies { title: string; note: string; color: string; icon: AppIconName }[];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-5 px-5 py-6 sm:px-10 lg:px-14">
        <Logo className="[&_svg]:h-10 sm:[&_svg]:h-12" />
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-7 text-sm font-medium"
        >
          <Link href="#how-it-works" className="hidden lg:inline-flex">
            How it works
          </Link>
          <Link href="/for-organizations" className="hidden md:inline-flex">
            For churches & organizations
          </Link>
          <Link
            href="#begin"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-espresso/25 px-4 py-2 transition-colors hover:bg-sage-100 sm:px-6"
          >
            Start a story{" "}
            <AppIcon
              name="arrowUpRight"
              size={18}
              className="ml-3 hidden sm:inline"
            />
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto max-w-[1440px] px-4 sm:px-8"
        >
          <div className="brand-gradient-chocolate relative isolate grid overflow-hidden rounded-[28px] text-white lg:min-h-[620px] lg:grid-cols-[1.05fr_1fr]">
            <div className="relative z-10 flex flex-col justify-center px-7 pb-3 pt-10 sm:px-12 sm:pt-16 lg:px-14 lg:py-20">
              <p className="brand-eyebrow mb-7 text-white/75">
                Stories woven together
              </p>
              <h1
                id="hero-heading"
                className="max-w-xl font-display text-[40px] font-medium leading-[1.07] tracking-[-.045em] text-white sm:text-[64px] xl:text-[76px]"
              >
                What you gave
                <br />
                lives on.
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-white/85 sm:text-lg">
                The stories behind your faith. The ways you sowed into others.
                Gather the life you’ve lived into a gift your family can keep
                coming back to.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3">
                <Link
                  href="#how-it-works"
                  className="inline-flex min-h-14 items-center justify-center gap-5 rounded-[14px] bg-paper px-6 py-4 font-medium text-espresso transition-colors hover:bg-clay-100"
                >
                  See how it works <AppIcon name="arrowRight" size={20} />
                </Link>
                <Link
                  href="#begin"
                  className="inline-flex min-h-12 items-center text-sm text-white underline decoration-white/45 underline-offset-8"
                >
                  Find your way to begin
                </Link>
              </div>
              <p className="mt-7 text-xs leading-relaxed text-white/70">
                A hackathon pilot. You review everything before sharing.
              </p>
            </div>
            <StoryMorphVisual className="self-center" />
          </div>
        </section>

        <section
          className="mx-auto grid max-w-[1280px] gap-9 px-6 py-16 sm:px-10 sm:py-24 lg:grid-cols-[.95fr_1fr] lg:items-center lg:gap-20"
          aria-labelledby="why-heading"
        >
          <figure className="relative min-h-[300px] overflow-hidden rounded-[24px] bg-sage-100 sm:min-h-[400px]">
            <Image
              src="/brand/story-exchange-branded-v1.png"
              alt="Illustration of two generations passing a Time Tapestry postcard across a table."
              fill
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover object-center"
            />
          </figure>
          <div>
            <p className="brand-eyebrow mb-5 text-taupe-600">
              The life behind the stories
            </p>
            <h2
              id="why-heading"
              className="max-w-lg text-4xl font-medium leading-[1.15] sm:text-5xl"
            >
              Help them know what shaped you.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-500">
              Your family may know what you did. There is more to tell about who
              helped you, where you saw God at work, and why you chose to give.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-ink-500">
              These are the stories that help them understand the faith and
              character behind the life they know.
            </p>
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-8 border-y border-warmgray-200 bg-white"
          aria-labelledby="conversation-heading"
        >
          <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-16 sm:px-10 sm:py-24 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20">
            <div>
              <p className="brand-eyebrow mb-5 text-taupe-600">
                01 / Begin with a conversation
              </p>
              <h2
                id="conversation-heading"
                className="max-w-lg text-4xl font-medium leading-[1.15] sm:text-5xl"
              >
                You don’t have to know where to start.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-ink-500">
                An AI interviewer asks one question at a time. Speak, write, or
                record video, and pause when you need to. Share the moments that
                come to mind.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-ink-500">
                There is room for the time you gave and the money you sowed into
                people, your church, or a ministry. Share the meaning behind
                those choices. Dollar amounts are always optional.
              </p>
              <div className="mt-7 flex items-start gap-3 text-sm leading-relaxed text-ink-500">
                <AppIcon
                  name="check"
                  size={20}
                  className="mt-0.5 text-sage-700"
                />
                <p>
                  You’ll review your stories and recordings before choosing what
                  to share.
                </p>
              </div>
            </div>
            <div className="brand-gradient-chocolate relative overflow-hidden rounded-[26px] p-8 text-white sm:p-10">
              <div className="mb-12 flex items-center gap-4">
                <SiriOrb size={64} animationDuration={18} />
                <p className="text-sm text-white/75">
                  A question from the interview
                </p>
              </div>
              <p className="font-display text-3xl font-medium leading-[1.35] sm:text-4xl">
                “Tell me about someone whose kindness has stayed with you.”
              </p>
              <p className="mt-7 max-w-sm text-base leading-relaxed text-white/75">
                There is no perfect answer. Start with a moment you remember.
              </p>
              <div className="mt-10 flex flex-wrap gap-2 border-t border-white/20 pt-5 text-xs text-white/80">
                <span className="rounded-full border border-white/25 px-3 py-2">
                  Speak
                </span>
                <span className="rounded-full border border-white/25 px-3 py-2">
                  Write
                </span>
                <span className="rounded-full border border-white/25 px-3 py-2">
                  Record video
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="collection"
          className="mx-auto max-w-[1328px] scroll-mt-8 px-6 py-16 sm:px-10 sm:py-24"
          aria-labelledby="collection-heading"
        >
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-20">
            <div>
              <p className="brand-eyebrow mb-5 text-taupe-600">
                02 / Gather what matters
              </p>
              <h2
                id="collection-heading"
                className="max-w-xl text-4xl font-medium leading-[1.15] sm:text-5xl"
              >
                Your words, in a collection of their own.
              </h2>
            </div>
            <p className="max-w-lg text-lg leading-relaxed text-ink-500">
              Four written stories, your chosen recordings, and the Scripture or
              encouragement you want to pass on. Together on a personal page for
              the people you choose.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {storyThemes.map((story, index) => (
              <li
                key={story.title}
                className={`flex min-h-[245px] flex-col rounded-[20px] p-7 ${story.color}`}
              >
                <div className="mb-9 flex items-center justify-between">
                  <span className="text-xs tracking-[.12em] text-ink-500">
                    0{index + 1}
                  </span>
                  <AppIcon
                    name={story.icon}
                    size={26}
                    className="text-taupe-600"
                  />
                </div>
                <h3 className="max-w-[220px] text-2xl font-semibold leading-tight">
                  {story.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-500">
                  {story.note}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-7 flex max-w-3xl items-start gap-3 text-sm leading-relaxed text-ink-500">
            <AppIcon
              name="collection"
              size={20}
              className="mt-0.5 text-sage-700"
            />
            The whole approved collection is available together. Your family can
            explore it at their own pace, then return whenever a postcard
            arrives.
          </p>
        </section>

        <section
          id="postcards"
          className="mx-auto max-w-[1440px] px-4 sm:px-8"
          aria-labelledby="postcards-heading"
        >
          <div className="grid overflow-hidden rounded-[28px] lg:grid-cols-[1fr_1.08fr]">
            <div className="brand-gradient-sage relative isolate flex min-h-[370px] items-center justify-center overflow-hidden p-7 sm:p-12">
              <BrandPattern
                variant="weave"
                className="absolute -bottom-20 -left-20 -z-10 w-[700px] max-w-none text-white opacity-[.09]"
              />
              <PostcardPreview />
            </div>
            <div className="bg-[#f0e8e0] px-7 py-12 sm:px-12 sm:py-14">
              <p className="brand-eyebrow mb-5 text-taupe-600">
                03 / Keep coming back
              </p>
              <h2
                id="postcards-heading"
                className="max-w-lg text-4xl font-medium leading-[1.15] sm:text-[44px]"
              >
                A little reminder to come back together.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-500">
                The first postcard introduces the collection. Three more bring
                them back to a story, a Scripture, or an encouragement you
                chose.
              </p>
              <p className="mb-1 mt-7 text-xs font-medium uppercase tracking-[.12em] text-taupe-600">
                The postcard plan
              </p>
              <ol className="divide-y divide-espresso/15">
                {[
                  ["After approval", "An invitation to the whole collection"],
                  ["Month 3", "A story worth returning to"],
                  ["Month 6", "Words of faith and encouragement"],
                  ["Month 9", "Another reason to reconnect"],
                ].map(([when, what]) => (
                  <li
                    key={when}
                    className="grid grid-cols-[95px_1fr] gap-4 py-4 text-sm sm:grid-cols-[115px_1fr]"
                  >
                    <span className="font-semibold">{when}</span>
                    <span className="text-ink-500">{what}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Each postcard’s QR code returns to the collection. Mailing and
                delivery are being tested in the pilot.
              </p>
            </div>
          </div>
        </section>

        <section
          id="begin"
          className="mx-auto max-w-[1328px] scroll-mt-8 px-6 py-16 sm:px-10 sm:py-24"
          aria-labelledby="begin-heading"
        >
          <p className="brand-eyebrow mb-5 text-taupe-600">
            There’s a place for your story
          </p>
          <h2
            id="begin-heading"
            className="max-w-2xl text-4xl font-medium leading-[1.15] sm:text-5xl"
          >
            Whose story would you like to pass on?
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <article className="flex flex-col rounded-[24px] border border-warmgray-200 bg-white p-7 sm:p-8">
              <AppIcon
                name="conversation"
                size={28}
                className="mb-8 text-sage-700"
              />
              <h3 className="text-2xl font-semibold">Share your story.</h3>
              <p className="mb-8 mt-4 leading-relaxed text-ink-500">
                Gather the stories, faith, and generosity you want your family
                to carry forward.
              </p>
              <Link
                href="/share"
                className="brand-button-primary mt-auto justify-between gap-3"
              >
                Share my story <AppIcon name="arrowUpRight" size={18} />
              </Link>
            </article>
            <article className="flex flex-col rounded-[24px] border border-warmgray-200 bg-white p-7 sm:p-8">
              <AppIcon name="heart" size={28} className="mb-8 text-clay-700" />
              <h3 className="text-2xl font-semibold">
                Invite someone you love.
              </h3>
              <p className="mb-8 mt-4 leading-relaxed text-ink-500">
                Give someone the invitation to tell the stories you have always
                wanted to hear.
              </p>
              <Link
                href="/request"
                className="brand-button-secondary mt-auto justify-between gap-3"
              >
                Request their story <AppIcon name="arrowUpRight" size={18} />
              </Link>
            </article>
            <article className="flex flex-col rounded-[24px] border border-sage-200 bg-sage-100 p-7 sm:p-8">
              <AppIcon
                name="handHeart"
                size={28}
                className="mb-8 text-sage-700"
              />
              <h3 className="text-2xl font-semibold">
                Give to your community.
              </h3>
              <p className="mb-8 mt-4 leading-relaxed text-ink-500">
                Create free gifts for donors, church members, or the families
                your organization serves.
              </p>
              <Link
                href="/for-organizations"
                className="brand-button-secondary mt-auto justify-between gap-3"
              >
                Start a free group gift <AppIcon name="arrowUpRight" size={18} />
              </Link>
            </article>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-ink-500">
            Free during the pilot. No payment details required. Physical postcard
            delivery is still being tested.{" "}
            <Link href="/pricing" className="underline underline-offset-4">
              Read the pilot details.
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
