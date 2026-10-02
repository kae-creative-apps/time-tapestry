import { Postcard } from '@/components/Postcard';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { demoStory } from '@/lib/mock-data';

const startDate = new Date();

function addWeeks(date: Date, weeks: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function PostcardsDemoPage() {
  const grandparentName = demoStory.grandparent.name;
  const grandchildName = demoStory.grandchild.name;
  const chapters = demoStory.chapters;

  const postcardItems = [
    {
      frontTitle: `A story from ${grandparentName}`,
      frontExcerpt: demoStory.welcomeNote,
      backMessage: `Dear ${grandchildName}, I am sending you pieces of my story, one postcard at a time. Start here.`,
      chapterIndex: 0,
      rotation: 'rotate-1' as const
    },
    {
      frontTitle: chapters[0]?.title ?? 'Chapter One',
      frontExcerpt: chapters[0]?.content ?? '',
      backMessage: `This is the story that shaped me. I wanted you to know where it all began.`,
      chapterIndex: 1,
      rotation: '-rotate-1' as const
    },
    {
      frontTitle: chapters[1]?.title ?? 'Chapter Two',
      frontExcerpt: chapters[1]?.content ?? '',
      backMessage: `This is when I learned that giving mattered, long before I had words for it.`,
      chapterIndex: 2,
      rotation: 'rotate-2' as const
    },
    {
      frontTitle: chapters[2]?.title ?? 'Chapter Three',
      frontExcerpt: chapters[2]?.content ?? '',
      backMessage: `These are the causes I hold close. They are people I have prayed for by name.`,
      chapterIndex: 3,
      rotation: '-rotate-2' as const
    },
    {
      frontTitle: chapters[3]?.title ?? 'Chapter Four',
      frontExcerpt: chapters[3]?.content ?? '',
      backMessage: `This is what I hope you remember from me, long after these postcards stop coming.`,
      chapterIndex: 4,
      rotation: 'rotate-1' as const
    }
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <div className="mb-12 text-center">
          <h1 className="mb-4 font-serif text-4xl text-ink sm:text-5xl">
            A legacy, in the mail
          </h1>
          <p className="mx-auto max-w-xl font-serif text-xl text-ink-500">
            Five postcards, sent one at a time. Each one carries a piece of the story.
          </p>
        </div>

        <div className="space-y-16">
          {postcardItems.map((item, i) => (
            <Postcard
              key={i}
              frontContent={item.frontExcerpt}
              frontTitle={item.frontTitle}
              backContent={item.backMessage}
              sentDate={formatDate(addWeeks(startDate, i))}
              chapterIndex={item.chapterIndex}
              sessionId="demo"
              rotation={item.rotation}
            />
          ))}
        </div>

        <p className="mt-16 text-center font-sans text-sm text-warmgray-500">
          This is a preview. In production, these would be mailed to you via Lob.
        </p>
      </main>
      <Footer />
    </div>
  );
}
