import demoStory from "./demo-story.json";

export type HackathonDemoChapter = {
  number: 1 | 2 | 3 | 4;
  path: `/hackathon-demo-${1 | 2 | 3 | 4}`;
  title: string;
  theme: "kindness" | "faith" | "generosity" | "encouragement";
  story: string;
  transcript: string;
  pullQuote: string;
  scripture: { reference: string; text: string; translation: "KJV" };
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
    title: "Roots of generosity",
    theme: "kindness",
    story: kindness,
    transcript:
      "One winter morning, your great-grandmother left a coat on the porch for a girl who walked past our house on her way to school.",
    pullQuote:
      "Someone once gave me their afternoons when I needed them most. Time is the best gift you can give.",
    scripture: {
      reference: "1 Peter 4:10",
      translation: "KJV",
      text: "As every man hath received the gift, even so minister the same one to another, as good stewards of the manifold grace of God.",
    },
    momentsTitle: "Three key moments",
    moments: [
      "One winter morning, your great-grandmother left a coat on the porch for a girl who walked past our house on her way to school.",
      "That was the first time I understood that generosity is a kind of noticing.",
      "You do not have to be rich to be generous.",
    ],
    next: { href: "/hackathon-demo-2", label: "Next chapter: Why I give" },
  },
  {
    number: 2,
    path: "/hackathon-demo-2",
    title: "Why I give",
    theme: "faith",
    story: faith,
    transcript:
      "I believe in our local food pantry, the children's literacy fund at our church, and the missionaries in Honduras we have supported for twenty years.",
    pullQuote:
      "When I did not know what came next, prayer helped me take the next small step. I hope you find that kind of peace.",
    scripture: {
      reference: "Lam 3:22–23",
      translation: "KJV",
      text: "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.",
    },
    momentsTitle: "Three key moments",
    moments: [
      "I believe in our local food pantry, the children's literacy fund at our church, and the missionaries in Honduras we have supported for twenty years.",
      "These are not just causes. They are people I have prayed for by name.",
      "I want my giving to keep noticing people long after I am gone.",
    ],
    next: {
      href: "/hackathon-demo-3",
      label: "Next chapter: Lives I’ve seen flourish",
    },
  },
  {
    number: 3,
    path: "/hackathon-demo-3",
    title: "Lives I’ve seen flourish",
    theme: "generosity",
    story: table,
    transcript: "In our house, giving started at the supper table.",
    pullQuote:
      "The good we give has a way of growing in places we may never see. Keep making room for others.",
    scripture: {
      reference: "Gal 6:9",
      translation: "KJV",
      text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.",
    },
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
    pullQuote:
      "There is always room for one more at the table. I hope you carry that welcome wherever life takes you.",
    scripture: {
      reference: "Matt 25:40",
      translation: "KJV",
      text: "And the King shall answer and say unto them, Verily I say unto you, Inasmuch as ye have done it unto one of the least of these my brethren, ye have done it unto me.",
    },
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
