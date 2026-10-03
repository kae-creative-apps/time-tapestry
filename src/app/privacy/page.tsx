import { Logo } from "@/components/Logo";
import Link from "next/link";
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Logo />
      <h1 className="mb-6 mt-12 font-serif text-4xl">
        How this pilot handles your story.
      </h1>
      <div className="space-y-6 leading-relaxed">
        <p>
          This pilot stores names, email addresses, optional phone
          numbers, postcard addresses, interview answers, recordings, written
          stories and recipient replies. Approved stories are shared through a
          private link. Anyone who has that link can open the shared stories,
          so keep it with people you trust.
        </p>
        <h2 className="font-serif text-2xl">Recordings and review</h2>
        <p>
          Recordings are saved on this device while you work and backed up when
          upload succeeds. The recorder tells you which state a take is in.
          Browser storage can be cleared or unavailable, so a local save alone
          is not a permanent backup. You can download individual takes.
        </p>
        <p>
          The storyteller reviews the stories, videos and postcard messages
          before sharing. Original recordings are kept separately from
          edited videos. This pilot does not yet offer self-service account
          deletion, complete data export or link revocation.
        </p>
        <h2 className="font-serif text-2xl">Services used to make the gift</h2>
        <p>
          When configured, Gloo processes answer text to help organize stories
          and follow-up questions; OpenAI transcribes recordings; ElevenLabs
          speaks interview questions and can process audio for an edited
          version. Vercel stores application records and private recording
          files. Lob receives approved postcard content and mailing details;
          Resend sends product emails. The video editor may use HyperFrames and
          Remotion to render graphics and approved footage.
        </p>
        <p>
          These services have their own data handling terms. Do not use this
          prototype to record confidential or sensitive material before the team
          has verified its production settings, retention and participant
          consent process.
        </p>
        <h2 className="font-serif text-2xl">Postcards and email</h2>
        <p>
          The first postcard introduces the gift. A follow-up email is scheduled
          two weeks after confirmed mailing. Recipients can turn off postcard
          follow-up invitations on their story page. Sending a reply
          notifies the storyteller by email.
        </p>
      </div>
      <Link className="mt-10 inline-block text-oxblood underline" href="/">
        Return home
      </Link>
    </main>
  );
}
