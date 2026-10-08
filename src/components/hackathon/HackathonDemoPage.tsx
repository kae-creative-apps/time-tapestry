import type { Metadata } from "next";
import { HackathonDemoChapter } from "@/components/hackathon/HackathonDemoChapter";
import { hackathonDemoChapter } from "@/data/hackathon-demo";
import { hackathonDemoFilm } from "@/data/hackathon-demo-films";
import { hackathonDemoPostcard } from "@/lib/hackathon/demo-postcard";

export function hackathonDemoMetadata(number: 1 | 2 | 3 | 4): Metadata {
  return {
    title: `${hackathonDemoChapter(number).title} | Time Tapestry demo`,
    robots: { index: false, follow: false },
  };
}

export async function HackathonDemoPage({ number }: { number: 1 | 2 | 3 | 4 }) {
  const chapter = hackathonDemoChapter(number);
  return (
    <HackathonDemoChapter
      chapter={chapter}
      film={hackathonDemoFilm(number)}
      postcard={await hackathonDemoPostcard(chapter)}
    />
  );
}
