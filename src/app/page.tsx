import Link from "next/link";
import Image from "next/image";
import { BrandLockup } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Footer } from "@/components/Footer";
import { SiriOrb } from "@/components/ui/siri-orb";
import { InterviewPreview } from "@/components/marketing/InterviewPreview";
import { PostcardCollection } from "@/components/marketing/PostcardCollection";
import { FrontDoorNav } from "@/components/marketing/FrontDoorNav";
import styles from "@/components/marketing/FrontDoor.module.css";

const steps = [
  {
    number: "01",
    title: "Start with a conversation.",
    description:
      "Gentle questions help you find the stories you want to share. Record with your voice or camera, and take it at your own pace.",
    icon: "conversation",
  },
  {
    number: "02",
    title: "See your stories take shape.",
    description:
      "Your recordings become four short films, in your own voice, and a four-chapter story book you can download and print.",
    icon: "collection",
  },
  {
    number: "03",
    title: "Give them to your people.",
    description:
      "Invite the people you love to a private collection. They can watch, read, and reply with a memory of their own.",
    icon: "heart",
  },
] satisfies {
  number: string;
  title: string;
  description: string;
  icon: AppIconName;
}[];

const chapters = [
  ["01", "Kindness received", "The people who made a difference."],
  ["02", "A life of faith", "What carried you, if you want to share."],
  ["03", "What you sowed", "The ways you gave to others."],
  ["04", "What I hope you carry", "Words for someone you love."],
];

function BookCover({ large = false }: { large?: boolean }) {
  return (
    <div
      className={`${styles.bookCover} ${large ? styles.bookCoverLarge : ""}`}
    >
      <div className={styles.bookSpine} />
      <div className={styles.bookCoverContent}>
        <BrandLockup variant="mark" className={styles.bookMark} />
        <p className={styles.bookTitle}>
          Stories
          <br />
          from Gigi
        </p>
        <p className={styles.bookDedication}>For Sammie, with love.</p>
        <span className={styles.bookRule} />
        <p className={styles.bookImprint}>TIME TAPESTRY</p>
      </div>
      <BrandPattern className={styles.bookWeave} />
    </div>
  );
}

export default function Home() {
  return (
    <div className={styles.frontDoor}>
      <FrontDoorNav />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroIntro}>
            <p className={styles.eyebrow}>
              A little of your life. A gift for theirs.
            </p>
            <h1 id="hero-heading">
              Give them the stories
              <br className={styles.heroBreak} /> only you can tell.
            </h1>
            <p className={styles.heroDescription}>
              The neighbor who showed up. The faith that carried you. The reason
              you always set another place at the table. Share those stories, in
              your own voice, with the people you love.
            </p>
            <div className={styles.actions}>
              <Link href="/share" className={styles.primaryButton}>
                Share my story <AppIcon name="arrowUpRight" size={20} />
              </Link>
              <Link href="/request" className={styles.secondaryButton}>
                Ask someone for theirs <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </div>
            <p className={styles.pilotNote}>
              Free during our pilot. No payment required.
            </p>
          </div>
          <div className={styles.showcase}>
            <figure className={styles.postcardFloat}>
              <div className={styles.postcardArtwork}>
                <Image
                  src="/brand/postcards/designer-2026-10-06-v2/postcard-01-kindness-front.webp"
                  alt="Sample kindness postcard from Gigi to Sammie, with a warm woven pattern."
                  width={1500}
                  height={1000}
                  sizes="(max-width: 700px) 44vw, (max-width: 1100px) 26vw, 340px"
                  priority
                  unoptimized
                />
              </div>
              <figcaption>
                A little encouragement
                <br />
                <span>Sample postcard design</span>
              </figcaption>
            </figure>
            <div className={styles.conversationPanel}>
              <p className={styles.panelEyebrow}>It begins with one question</p>
              <div className={styles.heroOrb}>
                <SiriOrb size="144px" />
              </div>
              <p className={styles.previewQuestion}>
                “Tell me about someone whose kindness has stayed with you.”
              </p>
              <InterviewPreview />
              <p className={styles.previewNote}>
                Listen to a sample. No microphone needed.
              </p>
            </div>
            <figure className={styles.bookFloat}>
              <BookCover />
              <figcaption>
                A story book to keep
                <br />
                <span>Book cover illustration</span>
              </figcaption>
            </figure>
          </div>
          <div
            className={styles.giftLine}
            aria-label="Your story collection includes"
          >
            <span>
              <AppIcon name="video" size={21} /> Four films in your voice
            </span>
            <span>
              <AppIcon name="collection" size={21} /> A printable story book
            </span>
            <span>
              <AppIcon name="shield" size={21} /> Shared privately
            </span>
          </div>
        </section>
        <section
          id="how-it-works"
          className={styles.howSection}
          aria-labelledby="how-heading"
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>You already have the stories</p>
            <h2 id="how-heading">We help you share them.</h2>
            <p>
              You don’t need to write a memoir or know where to start.
              <br className={styles.desktopBreak} /> Just begin with what you
              remember.
            </p>
          </div>
          <div className={styles.steps}>
            {steps.map((step) => (
              <div className={styles.step} key={step.number}>
                <div className={styles.stepTop}>
                  <span>{step.number}</span>
                  <AppIcon name={step.icon} size={28} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </section>
        <section
          id="collection"
          className={styles.collectionSection}
          aria-labelledby="collection-heading"
        >
          <div className={styles.collectionInner}>
            <div className={styles.collectionVisual}>
              <div className={styles.collectionBook}>
                <BookCover large />
              </div>
              <div className={styles.chapterSheet}>
                <p className={styles.sheetEyebrow}>A life in four chapters</p>
                {chapters.map(([number, title, note]) => (
                  <div className={styles.chapter} key={number}>
                    <span>{number}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{note}</p>
                    </div>
                  </div>
                ))}
                <span className={styles.sheetFooter}>
                  Stories woven together
                </span>
              </div>
              <p className={styles.visualCaption}>
                Sample collection illustration
              </p>
            </div>
            <div className={styles.collectionCopy}>
              <p className={styles.eyebrow}>More than the words alone</p>
              <h2 id="collection-heading">
                The story matters.
                <br />
                So does the way
                <br className={styles.desktopBreak} /> you tell it.
              </h2>
              <p>
                Your laugh in the middle of a memory. The way you say someone’s
                name. Your films keep the voice your family knows, using your
                original audio or video.
              </p>
              <p>
                Alongside them, a written story book gathers your memories into
                four chapters. Download it, print a copy, and leave room on the
                shelf for a little of your life.
              </p>
              <Link href="/share" className={styles.textLink}>
                Start with your first story{" "}
                <AppIcon name="arrowRight" size={20} />
              </Link>
            </div>
          </div>
        </section>
        <PostcardCollection />
        <section className={styles.moreSection} aria-labelledby="more-heading">
          <div className={styles.moreCopy}>
            <p className={styles.eyebrow}>Keep the conversation going</p>
            <h2 id="more-heading">
              There’s always
              <br />
              another story.
            </h2>
            <p>
              Once your first collection is complete, come back when another
              memory finds you. Add a new recording, or let your family choose a
              few questions they’d love to hear you answer.
            </p>
            <p>
              Explore 100 prompts about the people, choices, joys, and beliefs
              that shaped your life. Each new story becomes another film and a
              chapter in your growing book.
            </p>
            <p className={styles.faithNote}>
              Christian faith questions are always optional. Share what feels
              true to your life.
            </p>
            <Link href="#begin" className={styles.textLink}>
              Make a place for your stories{" "}
              <AppIcon name="arrowRight" size={20} />
            </Link>
          </div>
          <div className={styles.promptDisplay}>
            <div className={styles.promptDisplayHeader}>
              <AppIcon name="conversation" size={23} />
              <span>A question can open a whole story.</span>
            </div>
            <div className={styles.promptCard}>
              <span>Relationships</span>
              <p>“Tell me how one of your lasting friendships began.”</p>
            </div>
            <div className={`${styles.promptCard} ${styles.promptCardSage}`}>
              <span>Character</span>
              <p>“Tell me about a time keeping a promise mattered to you.”</p>
            </div>
            <div className={`${styles.promptCard} ${styles.promptCardClay}`}>
              <span>Health</span>
              <p>
                “What meal do you remember as an expression of someone’s care?”
              </p>
            </div>
            <p className={styles.promptCaption}>
              A few questions from the prompt library
            </p>
          </div>
        </section>
        <section
          className={styles.privacySection}
          aria-labelledby="privacy-heading"
        >
          <div className={styles.privacyIcon}>
            <AppIcon name="shield" size={32} />
          </div>
          <div>
            <h2 id="privacy-heading">
              Your stories belong with the people you choose.
            </h2>
            <p>
              Invite family by email to your private collection. Each viewer
              verifies their email before opening your stories, and you can
              remove access when you need to.
            </p>
          </div>
          <Link href="/privacy" className={styles.textLink}>
            How we protect your stories{" "}
            <AppIcon name="arrowUpRight" size={19} />
          </Link>
        </section>
        <section
          id="begin"
          className={styles.beginSection}
          aria-labelledby="begin-heading"
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Someone will be glad you began</p>
            <h2 id="begin-heading">Every family has a place to start.</h2>
            <p>
              Tell a story of your own, or invite someone whose stories you
              love.
            </p>
          </div>
          <div className={styles.beginChoices}>
            <div className={styles.beginChoice}>
              <AppIcon name="conversation" size={30} />
              <h3>“I have a story to share.”</h3>
              <p>
                Start with a memory. We’ll help you find the words and turn your
                recordings into something your family can return to.
              </p>
              <Link href="/share" className={styles.primaryButton}>
                Share my story <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </div>
            <div className={`${styles.beginChoice} ${styles.inviteChoice}`}>
              <AppIcon name="heart" size={30} />
              <h3>“I’d love to hear theirs.”</h3>
              <p>
                Send someone a personal invitation. Let them know you’d love to
                hear about the people and moments that made them who they are.
              </p>
              <Link href="/request" className={styles.secondaryButton}>
                Request their story <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </div>
          </div>
          <p className={styles.beginPilot}>
            Time Tapestry is free during our pilot. Physical postcard mailing is
            still being tested. <Link href="/pricing">About the pilot</Link>
          </p>
          <div className={styles.organizationLine}>
            <p>Good stories belong in communities, too.</p>
            <Link href="/for-organizations" className={styles.textLink}>
              For churches & organizations{" "}
              <AppIcon name="arrowUpRight" size={20} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
