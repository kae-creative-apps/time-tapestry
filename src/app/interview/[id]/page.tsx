import { InterviewSession } from '@/components/InterviewSession';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';

export default function InterviewPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <InterviewPageInner params={params} />
  );
}

async function InterviewPageInner({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <InterviewSession sessionId={id} />
      </main>
      <Footer />
    </div>
  );
}
