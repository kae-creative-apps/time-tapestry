import { Logo } from "@/components/Logo";
import Link from "next/link";
export default function About() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Logo />
      <h1 className="mb-6 mt-12 font-serif text-4xl">
        A legacy people can return to.
      </h1>
      <div className="space-y-6 text-lg leading-relaxed">
        <p>
          Time Tapestry is for organizations that serve major donors: ministries,
          nonprofits, foundations, advancement teams, and donor advisors. It is
          the easiest way for a donor to pass the experience and legacy of their
          generosity to their children and grandchildren.
        </p>
        <p>
          The conversation is about human flourishing. Why they give. What it
          meant. The joy, the faith, the relationships, and the lives that
          changed. What they hope their family carries forward. Donors are never
          asked about gift size.
        </p>
        <p>
          Kaelyn Brooks and Tayloe Hansen are building Time Tapestry with a
          focus on relationships and character, especially the practice of
          generosity.
        </p>
        <h2 className="pt-5 font-serif text-2xl">
          The research gives us a reason to explore.
        </h2>
        <p>
          In a 2021 Edward Jones and Age Wave survey, 43% of adults 50 and older
          named life lessons and values among their most important legacies.{" "}
          <a
            className="text-oxblood underline"
            href="https://www.prnewswire.com/news-releases/pandemic-prompted-first-time-legacy-planning-conversations-for-44-5-million-americans-edward-jones-finds-301398039.html"
          >
            Read the study announcement
          </a>
          .
        </p>
        <p>
          Barna reported that 51% of surveyed Protestant senior pastors were
          very concerned about younger Christians’ financial support for the
          church. That describes pastors’ concern, not what all younger donors
          do.{" "}
          <a
            className="text-oxblood underline"
            href="https://www.barna.com/research/future-generosity/"
          >
            Read Barna’s research
          </a>
          .
        </p>
        <p>
          Indiana University’s Women Give 2013 study linked parent-child
          conversations about giving with children’s giving. This supports
          studying family conversations. It does not prove Time Tapestry
          increases donations or family connection.{" "}
          <a
            className="text-oxblood underline"
            href="https://philanthropy.indianapolis.iu.edu/news-events/news/_news/2013/women-give-2013.html"
          >
            Read the study summary
          </a>
          .
        </p>
        <p>
          We will look at completed interviews, approved stories and replies,
          then ask families whether the experience led to a meaningful
          conversation.
        </p>
      </div>
      <Link href="/" className="mt-10 inline-block text-oxblood underline">
        Return home
      </Link>
    </main>
  );
}
