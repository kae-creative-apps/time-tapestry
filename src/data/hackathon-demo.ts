import demoStory from "./demo-story.json";

export type HackathonDemoChapter = {
  number: 1 | 2 | 3 | 4;
  path: `/hackathon-demo-${1 | 2 | 3 | 4}`;
  title: string;
  theme: "kindness" | "faith" | "generosity" | "encouragement";
  story: string;
  transcript: string;
  pullQuote: string;
  momentsTitle: string;
  moments: readonly string[];
  next: { href: string; label: string } | null;
};

const stories = demoStory.chapters.map((chapter) => chapter.content);
const [kindness, table, faith, hope] = stories;

export const hackathonDemoChapters: readonly HackathonDemoChapter[] = [
  {
    number: 1,
    path: "/hackathon-demo-1",
    title: "Kindness received",
    theme: "kindness",
    story: kindness,
    transcript:
      "One winter morning, your great-grandmother left a coat on the porch for a girl who walked past our house on her way to school.",
    pullQuote: "Because she was cold, and we had two.",
    momentsTitle: "Three key moments",
    moments: [
      "One winter morning, your great-grandmother left a coat on the porch for a girl who walked past our house on her way to school.",
      "That was the first time I understood that generosity is a kind of noticing.",
      "You do not have to be rich to be generous.",
    ],
    next: { href: "/hackathon-demo-2", label: "Next chapter: A life of faith" },
  },
  {
    number: 2,
    path: "/hackathon-demo-2",
    title: "A life of faith",
    theme: "faith",
    story: faith,
    transcript:
      "I believe in our local food pantry, the children's literacy fund at our church, and the missionaries in Honduras we have supported for twenty years.",
    pullQuote:
      "I give because I was once the child who needed the coat, and someone noticed me.",
    momentsTitle: "Three key moments",
    moments: [
      "I believe in our local food pantry, the children's literacy fund at our church, and the missionaries in Honduras we have supported for twenty years.",
      "These are not just causes. They are people I have prayed for by name.",
      "I want my giving to keep noticing people long after I am gone.",
    ],
    next: { href: "/hackathon-demo-3", label: "Next chapter: What you sowed" },
  },
  {
    number: 3,
    path: "/hackathon-demo-3",
    title: "What you sowed",
    theme: "generosity",
    story: table,
    transcript: "In our house, giving started at the supper table.",
    pullQuote: "The table is long enough if you pull up another chair.",
    momentsTitle: "Three key moments",
    moments: [
      "In our house, giving started at the supper table.",
      "Mama taught us that hospitality was not a special occasion.",
      "The table is long enough if you pull up another chair.",
    ],
    next: {
      href: "/hackathon-demo-4",
      label: "Next chapter: What I hope you carry",
    },
  },
  {
    number: 4,
    path: "/hackathon-demo-4",
    title: "What I hope you carry",
    theme: "encouragement",
    story: hope,
    transcript:
      "Sammie, I hope you remember that a good life does not have to be loud.",
    pullQuote: "I hope you remember that a good life does not have to be loud.",
    momentsTitle: "What Gigi hopes Sammie carries",
    moments: [
      "Sammie, I hope you remember that a good life does not have to be loud.",
      "I hope you remember that faith, family, and paying attention matter more than having much.",
      "When you give someday, give in your own name, in your own way.",
    ],
    next: null,
  },
];

export function hackathonDemoChapter(number: 1 | 2 | 3 | 4) {
  const chapter = hackathonDemoChapters.find((item) => item.number === number);
  if (!chapter) throw new Error("Unknown hackathon demo chapter.");
  return chapter;
}
