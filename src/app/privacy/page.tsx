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
          This pilot stores names, email addresses, optional phone numbers,
          postcard addresses, interview answers, recordings, written stories and
          recipient replies. Recipients must verify the email address selected
          for them before opening approved stories. A postcard QR code locates
          the collection but does not unlock it. Your storyteller workspace link
          remains a private access credential, so keep it for yourself.
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
          before sharing. Original recordings are kept separately from edited
          videos. This pilot does not yet offer self-service account deletion,
          complete data export or story-link revocation. Organization organizers
          can revoke unclaimed gift invitations and see chapter completion and
          mailing status, but cannot view a family’s interview answers,
          recordings or approved story page through the organization dashboard.
        </p>
        <h2 className="font-serif text-2xl">Services used to make the gift</h2>
        <p>
          When configured, Gloo processes answer text to help organize stories
          and follow-up questions; OpenAI transcribes recordings; ElevenLabs
          processes live interview audio and transcripts, speaks the interview
          questions. New story films use your original recorded voice or video,
          never an AI replacement for your voice. Local previews store records
          and uploads on the server’s filesystem. Hosted deployments require
          configured persistent storage for records and private recordings. When
          delivery is enabled, Lob receives approved postcard content and
          mailing details; Resend sends product emails. HyperFrames and Remotion
          render the approved story films. Your original footage is kept
          separately.
        </p>
        <p>
          These services have their own data handling terms. Do not use this
          prototype to record confidential or sensitive material before the team
          has verified its production settings, retention and participant
          consent process.
        </p>
        <h2 className="font-serif text-2xl">Returning and getting help</h2>
        <p>
          You can return to an unfinished interview using your private
          storyteller link. Drafts are not automatically deleted in this pilot,
          but we do not promise permanent storage. A live connection lasts up to
          45 minutes; you can return for another session. Storage and generation
          allowances help prevent misuse. Approved collections stay unchanged in
          this pilot.
        </p>
        <p>
          Authorized team members can use a private admin workspace to inspect
          saved work, download recordings and investigate failed processing.
          Access to these records is logged. Server uploads, device copies and
          independent backups are different: an independent cloud backup is not
          configured simply by uploading a recording.
        </p>
        <h2 className="font-serif text-2xl">What is visible on a postcard</h2>
        <p>
          Postcards are open mail. Their encouragement, printed names and
          mailing address can be read by postal workers or anyone handling the
          card. The storyteller reviews and approves these public messages
          separately. Interview excerpts, financial details, recordings and
          private blessings are not copied onto postcards automatically. Only
          include words in the public message that you are comfortable having
          others read.
        </p>
        <h2 className="font-serif text-2xl">Postcards and email</h2>
        <p>
          Postcard and email delivery depend on a configured delivery service
          and job runner. Queued messages have not necessarily been sent. In the
          organization pilot, organizers copy and share donor invitation links
          themselves. The planned first postcard introduces the gift, with a
          follow-up email two weeks after confirmed mailing. Recipients can turn
          off postcard follow-up invitations on their story page.
        </p>
      </div>
      <Link className="mt-10 inline-block text-oxblood underline" href="/">
        Return home
      </Link>
    </main>
  );
}
