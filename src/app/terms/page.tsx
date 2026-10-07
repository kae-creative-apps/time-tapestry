import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pilot terms | Time Tapestry",
  description:
    "How the free Time Tapestry pilot works: private stories, postcard QR codes, and what is still being tested.",
};

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Logo />
      <h1 className="mb-6 mt-12 font-serif text-4xl">
        Terms for this free pilot.
      </h1>
      <div className="space-y-6 leading-relaxed">
        <p>
          Time Tapestry is a free pilot. You can record stories, review them,
          and share an approved collection with people you choose. No card or
          payment is collected. These terms describe the pilot as it works
          today. They are not a promise that every feature will stay free or
          unchanged.
        </p>
        <h2 className="font-serif text-2xl">What you share</h2>
        <p>
          You choose the recipient and what to approve. Nothing is shared until
          you approve the stories. A postcard QR code opens the chapter page for
          that gift, but it does not unlock the stories. The invited person
          verifies the email address selected for them before they can watch,
          read, reply, or ask for another story.
        </p>
        <p>
          Postcards are open mail. Only include words in the public message that
          you are comfortable having others read. Interview recordings, private
          blessings, and collection links stay off the card.
        </p>
        <h2 className="font-serif text-2xl">Replies and later chapters</h2>
        <p>
          An invited recipient can send a private reply from a story, or ask a
          follow-up from the story library. You choose whether to record an
          answer. A new chapter is shared only after you submit that recording
          and it is prepared. You can pass on a question.
        </p>
        <h2 className="font-serif text-2xl">Groups</h2>
        <p>
          A church or organization can create free gift invitations and see
          chapter and mailing progress. Organizers do not receive story text,
          recordings, or collection keys. They share each gift link themselves.
        </p>
        <h2 className="font-serif text-2xl">What is still being tested</h2>
        <p>
          Physical postcard mailing and automatic email are not promised as part
          of the free pilot. Drafts are not automatically deleted, and this
          pilot does not yet offer self-service account deletion or a complete
          data export. Do not record confidential or sensitive material.{" "}
          <Link className="text-oxblood underline" href="/privacy">
            How this pilot handles your story
          </Link>{" "}
          explains the information that is stored and the services used to make
          the gift.
        </p>
      </div>
      <Link className="mt-10 inline-block text-oxblood underline" href="/">
        Return home
      </Link>
    </main>
  );
}
