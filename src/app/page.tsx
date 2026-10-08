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
    title: "Invite your donors.",
    description:
      "Tell us about your ministry, nonprofit, foundation, or advancement team. Choose how many donors to invite.",
    icon: "handHeart",
  },
  {
    number: "02",
    title: "Invite a donor by name.",
    description:
      "Send a personal invitation. A guided conversation helps them talk about why they give, in their own voice, at their own pace.",
    icon: "conversation",
  },
  {
    number: "03",
    title: "Their family receives the story.",
    description:
      "Children and grandchildren get four short films, a story book, and postcards: the joy, faith, and lives behind a legacy of generosity.",
    icon: "collection",
  },
] satisfies {
  number: string;
  title: string;
  description: string;
  icon: AppIconName;
}[];

const chapters = [
  ["01", "Roots of generosity", "Who modeled a generous life."],
  ["02", "Why I give", "The faith and values that moved them."],
  ["03", "Lives I’ve seen flourish", "Ministries and people they love."],
  ["04", "What I hope you carry", "A blessing for their family."],
];

const benefits = [
  {
    title: "Easy for the donor",
    text: "They answer gentle questions out loud. No memoir to write, and no one asks what they gave.",
  },
  {
    title: "A keepsake for their family",
    text: "Four films in their voice, a printable story book, and postcards their children and grandchildren can return to.",
  },
  {
    title: "Private by design",
    text: "The donor chooses who can open the collection. Your team sees progress, not the private story.",
  },
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
        <p className={styles.bookDedication}>For Sammie, her granddaughter.</p>
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
              For ministries, nonprofits, and advancement teams
            </p>
            <h1 id="hero-heading">
              Helping your donors pass on
              <br className={styles.heroBreak} /> a legacy of generosity.
            </h1>
            <p className={styles.heroDescription}>
              The easiest way for a major donor to share why they give — the
              joy, the faith, the relationships, the lives changed — with their
              children and grandchildren.
            </p>
            <div className={styles.actions}>
              <Link href="/for-organizations#invite-donors" className={styles.primaryButton}>
                Invite your donors{" "}
                <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </div>
            <p className={styles.assuranceNote}>
              Donors are never asked about gift size.
            </p>
          </div>
          <div className={styles.showcase}>
            <figure className={styles.postcardFloat}>
              <div className={styles.postcardArtwork}>
                <Image
                  src="/brand/postcards/designer-2026-10-06-v2/postcard-01-kindness-front.webp"
                  alt="Sample postcard from Gigi, a donor, for her granddaughter Sammie."
                  width={1500}
                  height={1000}
                  sizes="(max-width: 700px) 44vw, (max-width: 1100px) 26vw, 340px"
                  priority
                  unoptimized
                />
              </div>
              <figcaption>
                A reminder of her generosity
                <br />
                <span>Sample postcard for Sammie</span>
              </figcaption>
            </figure>
            <div className={styles.conversationPanel}>
              <p className={styles.panelEyebrow}>A question for your donors</p>
              <div className={styles.heroOrb}>
                <SiriOrb size="144px" />
              </div>
              <p className={styles.previewQuestion}>
                “What made you become so generous?”
              </p>
              <InterviewPreview />
              <p className={styles.previewNote}>
                Preview the questions. Nothing is recorded here.
              </p>
            </div>
            <figure className={styles.bookFloat}>
              <BookCover />
              <figcaption>
                Gigi’s story, for Sammie
                <br />
                <span>A donor’s keepsake for her granddaughter</span>
              </figcaption>
            </figure>
          </div>
          <div
            className={styles.giftLine}
            aria-label="Your story collection includes"
          >
            <span>
              <AppIcon name="video" size={21} /> Four films in the donor’s voice
            </span>
            <span>
              <AppIcon name="collection" size={21} /> A story book for their family
            </span>
            <span>
              <AppIcon name="shield" size={21} /> Never about gift size
            </span>
          </div>
        </section>
        <section
          id="how-it-works"
          className={styles.howSection}
          aria-labelledby="how-heading"
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="how-heading">From an invitation to a family keepsake.</h2>
            <p>
              Your donors already carry the story. Time Tapestry helps them
              tell it to the people who will inherit their example.
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
                <p className={styles.sheetEyebrow}>A legacy in four chapters</p>
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
                  For the next generation
                </span>
              </div>
              <p className={styles.visualCaption}>
                Sample: Gigi’s collection for her granddaughter, Sammie
              </p>
            </div>
            <div className={styles.collectionCopy}>
              <p className={styles.eyebrow}>What your donors’ families receive</p>
              <h2 id="collection-heading">
                The voice they know.
                <br />
                The reason they give.
              </h2>
              <p>
                Films keep a donor’s laugh, the way they say a name, and the
                stories of people whose lives flourished because of their
                generosity. The story book gathers that into four chapters their
                children and grandchildren can hold.
              </p>
              <ul className={styles.benefitList}>
                {benefits.map((benefit) => (
                  <li key={benefit.title}>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.text}</p>
                  </li>
                ))}
              </ul>
              <Link href="/for-organizations" className={styles.textLink}>
                Bring this to your donors{" "}
                <AppIcon name="arrowRight" size={20} />
              </Link>
            </div>
          </div>
        </section>
        <PostcardCollection />
        <section className={styles.moreSection} aria-labelledby="more-heading">
          <div className={styles.moreCopy}>
            <p className={styles.eyebrow}>Examples</p>
            <h2 id="more-heading">
              A donor’s generosity,
              <br />
              told to their family.
            </h2>
            <p>
              Gigi is a sample donor. She records why she gives, the ministries
              she loves, and what she hopes her granddaughter Sammie will carry.
              The collection is Gigi’s story of generosity, passed to the next
              generation.
            </p>
            <p>
              Ministries, foundations, and donor advisors can offer the same
              conversation. An advancement team can leave it with a major donor
              as a family keepsake: the human side of a life of giving.
            </p>
            <p className={styles.faithNote}>
              Faith questions stay optional. Donors share what is true for them,
              and they are never asked how much they give.
            </p>
            <Link href="/for-organizations#invite-donors" className={styles.textLink}>
              Invite your donors{" "}
              <AppIcon name="arrowRight" size={20} />
            </Link>
          </div>
          <div className={styles.promptDisplay}>
            <div className={styles.promptDisplayHeader}>
              <AppIcon name="conversation" size={23} />
              <span>Questions a donor might hear.</span>
            </div>
            <div className={styles.promptCard}>
              <span>Sample · Gigi for Sammie</span>
              <p>“Why did you fall in love with these ministries?”</p>
            </div>
            <div className={`${styles.promptCard} ${styles.promptCardSage}`}>
              <span>Example · Advancement team</span>
              <p>“Why was it worth it to you?”</p>
            </div>
            <div className={`${styles.promptCard} ${styles.promptCardClay}`}>
              <span>Example · A ministry</span>
              <p>“What do you hope your grandchildren carry from this?”</p>
            </div>
            <p className={styles.promptCaption}>
              Sample questions. Not a record of a real interview.
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
              A donor’s story stays with the family they choose.
            </h2>
            <p>
              Donors invite children and grandchildren by email. Each person
              verifies their email before opening the collection, and access can
              be removed. Your organization does not receive the private
              recordings.
            </p>
          </div>
          <Link href="/privacy" className={styles.textLink}>
            How stories are protected{" "}
            <AppIcon name="arrowUpRight" size={19} />
          </Link>
        </section>
        <section
          id="begin"
          className={styles.beginSection}
          aria-labelledby="begin-heading"
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>For your organization</p>
            <h2 id="begin-heading">Offer this to the donors you serve.</h2>
            <p>
              Invite major donors at ministries, nonprofits, foundations, and
              advancement teams to record the story of their generosity.
            </p>
          </div>
          <div className={styles.beginChoices}>
            <div className={styles.beginChoice}>
              <AppIcon name="handHeart" size={30} />
              <h3>Bring it to your donors.</h3>
              <p>
                Invite major donors to record the story of their generosity
                for their children and grandchildren.
              </p>
              <Link href="/for-organizations#invite-donors" className={styles.primaryButton}>
                Invite your donors <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </div>
          </div>
          <p className={styles.beginNote}>
            No payment details. Donors are never asked about gift size.{" "}
            <Link href="/pricing">How invitations work</Link>
          </p>
          <div className={styles.organizationLine}>
            <p>A legacy of generosity, in their own voice.</p>
            <Link href="/for-organizations#invite-donors" className={styles.textLink}>
              Talk with us <AppIcon name="arrowUpRight" size={20} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
