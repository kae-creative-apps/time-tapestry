import type { Metadata } from "next";
import { HackathonDemoChapter } from "@/components/hackathon/HackathonDemoChapter";
import { hackathonDemoChapter } from "@/data/hackathon-demo";

const chapter = hackathonDemoChapter(4);

export const metadata: Metadata = {
  title: `${chapter.title} | Time Tapestry demo`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return <HackathonDemoChapter chapter={chapter} />;
}
