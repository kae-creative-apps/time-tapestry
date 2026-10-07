// Fictional demo family for the hackathon. Gigi, Sammie, the ministries and
// every voice in these films are illustrative; no real interview is used.

export type DemoSpeaker = "interviewer" | "gigi";

/** One spoken turn. Bracketed cues such as [chuckles] steer the AI voice only. */
export type DemoLine = { speaker: DemoSpeaker; text: string };

export type HackathonDemoChapter = {
  number: 1 | 2 | 3 | 4;
  path: `/hackathon-demo-${1 | 2 | 3 | 4}`;
  title: string;
  theme: "kindness" | "faith" | "generosity" | "encouragement";
  postcard: { number: 1 | 2 | 3 | 4; sentOnDay: number; message: string };
  question: string;
  conversation: readonly DemoLine[];
  transcript: string;
  story: string;
  pullQuote: string;
  scripture: { reference: string; text: string; translation: "NIV" | "ESV" };
  momentsTitle: string;
  moments: readonly { title: string; text: string }[];
  next: { href: string; label: string; teaser: string } | null;
};

export const HACKATHON_DEMO_STORYTELLER = {
  fullName: "Margaret “Gigi” Ellis",
  firstName: "Gigi",
  age: 73,
  hometown: "Dayton, Ohio",
  description: "Major donor, giving for fifty years",
  recipient: "Sammie",
  recipientDescription: "her granddaughter, 16",
} as const;

export const HACKATHON_DEMO_PARTNER_NOTE =
  "What a donor’s family receives. Time Tapestry helps ministries and advisors help major donors pass down a legacy of generosity, in their own voice.";

export const HACKATHON_DEMO_ORIGIN = "https://timetapestry.app";

/** Removes the voice-direction cues so captions and on-page text read cleanly. */
export function spokenText(text: string) {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const hackathonDemoChapters: readonly HackathonDemoChapter[] = [
  {
    number: 1,
    path: "/hackathon-demo-1",
    title: "Kindness received",
    theme: "kindness",
    postcard: {
      number: 1,
      sentOnDay: 0,
      message:
        "Someone once gave me their afternoons when I needed them most. That's where my giving began.",
    },
    question: "What made you become so generous?",
    conversation: [
      {
        speaker: "interviewer",
        text: "Gigi, what made you become so generous?",
      },
      {
        speaker: "gigi",
        text: "[chuckles] Oh, honey. I didn't decide to be generous. I was loved into it. [pause] I was nine, and I was so sick I couldn't get out of bed. Mom was working two shifts. And every afternoon at three o'clock there'd be a knock, and it was Mrs. Hale with a pot of soup. [pause] All winter long. She'd pull a chair up by my bed and read to me, and when I got well, she taught me to make bread. She never once said what it cost her. [softly] She just stayed.",
      },
      {
        speaker: "interviewer",
        text: "When did giving start to feel like joy for you, instead of duty?",
      },
      {
        speaker: "gigi",
        text: "Oh, I remember exactly. [pause] Walt and I had just started the shop. Ellis Tool and Die, in a two-car garage. We didn't have much. And a family at church lost their house in a fire, and Walt looked at me and said, 'What if we did the whole thing?' [laughs] It scared me to death. But we did it. [pause] And I'll tell you, I have never slept better. I felt rich. Like Mrs. Hale must have felt, walking home from our house. [pause] That's the secret nobody tells you, Sammie. Giving doesn't make your life smaller. It makes it so much bigger.",
      },
    ],
    transcript: "I didn't decide to be generous. I was loved into it.",
    story: `People ask me what made me so generous. The honest answer is that I didn't decide to be. I was loved into it.

The winter I turned nine, I came down with rheumatic fever and spent almost three months in bed. Your great-grandmother was working double shifts at the hospital laundry, and Dad was out every day looking for work. The house was very quiet.

Then one afternoon there was a knock. It was Mrs. Hale from church, a widow I barely knew, with a pot of soup. She came back every afternoon that winter. She read to me, and when I could sit up, she taught me to make bread. She never once mentioned what it cost her.

Years later, your grandpa Walt and I were just getting the shop started in a two-car garage. We didn't have much. When a family from church lost their house to a fire, Walt asked, "What if we did the whole thing?" It scared me to death. We did it anyway.

I have never slept better than I did that night. I felt rich, the way I imagine Mrs. Hale felt walking home from our house.

That's the secret, Sammie. Giving never made our life smaller. It made it so much bigger.`,
    pullQuote: "I didn't decide to be generous. Somebody loved me into it.",
    scripture: {
      reference: "1 Peter 4:10",
      translation: "NIV",
      text: "Each of you should use whatever gift you have received to serve others.",
    },
    momentsTitle: "Three key moments",
    moments: [
      {
        title: "The three o'clock knock",
        text: "Mrs. Hale's soup, and a chair pulled up by the bed.",
      },
      {
        title: "Loved into it",
        text: "A sick nine-year-old learns what it feels like to be cared for.",
      },
      {
        title: "The gift that stretched us",
        text: "A house fire, and Walt's question: what if we did the whole thing?",
      },
    ],
    next: {
      href: "/hackathon-demo-2",
      label: "A life of faith",
      teaser: "Arrives in about two weeks.",
    },
  },
  {
    number: 2,
    path: "/hackathon-demo-2",
    title: "A life of faith",
    theme: "faith",
    postcard: {
      number: 2,
      sentOnDay: 14,
      message: "Give to what you love up close. Faces, not causes.",
    },
    question: "Why did you fall in love with the ministries you give to?",
    conversation: [
      {
        speaker: "interviewer",
        text: "Why did you fall in love with the ministries you give to?",
      },
      {
        speaker: "gigi",
        text: "[exhales] Because they loved us first. [pause] Your Uncle Danny came eight weeks early, in nineteen seventy-seven. Six weeks in the hospital. We lived forty minutes away, and there was this little family house across the street where parents could sleep near their babies. They gave us a room and a key, and a lady named Ruth left coffee out every morning. [pause] I'd sit at that kitchen table at two in the morning, and I didn't have fancy prayers. I just said, 'Help.' And every morning, somehow, there was enough.",
      },
      {
        speaker: "interviewer",
        text: "What made you keep coming back, all those years later?",
      },
      {
        speaker: "gigi",
        text: "The people. [chuckles] I didn't fall in love with a cause. I fell in love with faces. [pause] When the shop started doing well, Walt and I went back to that house. We started small, and then, well, we kept going. They built a new wing a few years ago, and I'm not going to tell you the number. The number was never the point. [pause] The point is, there's a mom sleeping in that wing tonight, right near her baby. And somebody's leaving her coffee. [softly] God was so generous with us first, Sammie. Giving it back is the most joyful thing I know how to do.",
      },
    ],
    transcript:
      "I didn't fall in love with a cause. I fell in love with faces.",
    story: `I didn't fall in love with the ministries we support because of a brochure. I fell in love because they loved us first.

Your Uncle Danny came eight weeks early, in 1977. He spent six weeks in the hospital, and we lived forty minutes away. Across the street was a little family house where parents could sleep near their babies. They gave us a room and a key, and a volunteer named Ruth left coffee out every morning.

I'd sit at that borrowed kitchen table at two in the morning and pray. Nothing fancy. Mostly just "help." I wasn't strong, and I didn't feel brave. But every morning there was enough for that day.

Danny came home. And when the shop started doing well, your grandpa and I went back to that house. We started small, and then we kept going. A few years ago they opened a new wing. I won't tell you the number. The number was never the point.

The point is that tonight there's a mom sleeping in that wing, right near her baby, and somebody is leaving her coffee.

God was generous with us first, Sammie. Giving it back is the most joyful thing I know how to do.`,
    pullQuote: "I didn't fall in love with a cause. I fell in love with faces.",
    scripture: {
      reference: "2 Corinthians 9:7",
      translation: "NIV",
      text: "Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.",
    },
    momentsTitle: "Three key moments",
    moments: [
      {
        title: "Two in the morning",
        text: "Prayers at a borrowed kitchen table while Danny was in the hospital.",
      },
      {
        title: "The house across the street",
        text: "A room, a key and Ruth's coffee every morning.",
      },
      {
        title: "Coming back as givers",
        text: "Years later, a new wing, so another mom can sleep near her baby.",
      },
    ],
    next: {
      href: "/hackathon-demo-3",
      label: "What you sowed",
      teaser: "Arrives in about two weeks.",
    },
  },
  {
    number: 3,
    path: "/hackathon-demo-3",
    title: "What you sowed",
    theme: "generosity",
    postcard: {
      number: 3,
      sentOnDay: 28,
      message: "The good you sow keeps growing long after you see it.",
    },
    question: "Why was it worth it to you?",
    conversation: [
      {
        speaker: "interviewer",
        text: "Gigi, you and Walt gave so much over the years. Why was it worth it to you?",
      },
      {
        speaker: "gigi",
        text: "[laughs] Oh, people think it made us poorer. It made us richer. Not on paper. In friends, in purpose, in a life I wouldn't trade for anything. [pause] When Walt sold the shop, we gave the gift that built the church kitchen. And I ran the Wednesday supper in that kitchen for thirty-one years. Soup, bread, and whoever walked in. I always set one more chair than we had people. Somebody always came to sit in it. [pause] Some of my dearest friends in this world, I met over a bowl of soup on a Wednesday night.",
      },
      {
        speaker: "interviewer",
        text: "Did you ever get to see what it meant to someone?",
      },
      {
        speaker: "gigi",
        text: "[pause] Once, I really saw it. About ten years ago, a young woman came up to me after supper. She said when she was little, her dad had surgery and couldn't work, and I brought soup to their house every Tuesday that winter. She said that soup kept her family going. [softly] I didn't even remember her. [pause] She's a nurse now. And she volunteers at the family house, the one by the hospital. [chuckles] So you see? It just keeps going. You plant things you'll never see grow. Sometimes God lets you see one.",
      },
    ],
    transcript:
      "It made us richer. Not on paper. In friends, in purpose, in a life I wouldn't trade for anything.",
    story: `People assume giving made your grandpa and me poorer. It made us richer. Not on paper. In friends, in purpose, in a life I wouldn't trade for anything.

When Walt sold the shop, we gave the gift that built our church kitchen. I ran the Wednesday supper in that kitchen for thirty-one years. Soup, bread and whoever walked in. I always set one more chair than we had people, and somebody always came to sit in it. Some of my dearest friends, I met over a bowl of soup on a Wednesday night.

About ten years ago, a young woman came up to me after supper. She said that when she was little, her dad had surgery and couldn't work, and I brought soup to their house every Tuesday that winter. She said that soup kept her family going. I didn't even remember her.

She's a nurse now. And she volunteers at the family house by the hospital, the same one that took us in when Danny was born.

That's why it was worth it, Sammie. It keeps going. You plant things you'll never see grow. Sometimes God lets you see one.`,
    pullQuote: "People think giving made us poorer. It made us richer.",
    scripture: {
      reference: "Acts 20:35",
      translation: "NIV",
      text: "…remembering the words the Lord Jesus himself said: ‘It is more blessed to give than to receive.’",
    },
    momentsTitle: "Three key moments",
    moments: [
      {
        title: "The kitchen we built",
        text: "When Walt sold the shop, the gift that built the church kitchen.",
      },
      {
        title: "One extra chair",
        text: "Thirty-one years of Wednesday suppers, and friends made over soup.",
      },
      {
        title: "The nurse who came back",
        text: "Tuesday soup, grown into a life of caring for others.",
      },
    ],
    next: {
      href: "/hackathon-demo-4",
      label: "What I hope you carry",
      teaser: "Arrives in about two weeks.",
    },
  },
  {
    number: 4,
    path: "/hackathon-demo-4",
    title: "What I hope you carry",
    theme: "encouragement",
    postcard: {
      number: 4,
      sentOnDay: 42,
      message: "Keep your table open. There's always room for one more chair.",
    },
    question: "What do you hope Sammie carries from your generosity?",
    conversation: [
      {
        speaker: "interviewer",
        text: "What do you hope Sammie carries from your generosity?",
      },
      {
        speaker: "gigi",
        text: "Oh. [pause] Can I just... talk to her?",
      },
      {
        speaker: "interviewer",
        text: "Of course. Go right ahead.",
      },
      {
        speaker: "gigi",
        text: "[softly] Okay. Sammie, this part is just for you. [pause] You've heard about Mrs. Hale, and the family house, and all those Wednesday suppers. And someday there'll be some money that comes to you, and that's fine. [pause] But the money was never the inheritance, honey. This is. [pause] So. Give close enough to see faces. Don't just send checks to places you've never visited. Go. Sit down. Learn names. [pause] Give your time before your money. Time is what Mrs. Hale gave me, and it changed everything. [pause] Give with open hands. You don't need your name on anything. Nobody has to know. [pause] And let it make you glad. If giving ever feels heavy, something's wrong. It should feel like the best part of your week. [pause] Now. [chuckles] I've set aside a little fund in your name, and you get to decide where it goes. Not me. You. Start with one afternoon. Go see somebody's work up close, and then come tell me what you found. [pause] [softly] I love you. I'm proud of you. Now go make some soup for somebody.",
      },
    ],
    transcript: "But the money was never the inheritance, honey. This is.",
    story: `Sammie, this part is just for you.

You've heard about Mrs. Hale, the family house and all those Wednesday suppers. Someday some money will come to you, and that's fine. But the money was never the inheritance. This is.

Here's what I hope you carry:

Give close enough to see faces. Don't just send checks to places you've never visited. Go. Sit down. Learn names.

Give your time before your money. Time is what Mrs. Hale gave me, and it changed everything.

Give with open hands. You don't need your name on anything. Nobody has to know.

Let it make you glad. If giving ever feels heavy, something's wrong. It should feel like the best part of your week.

I've set aside a little fund in your name, and you get to decide where it goes. Not me. You. Start with one afternoon. Go see somebody's work up close, and then come tell me what you found.

I love you. I'm proud of you. Now go make some soup for somebody.`,
    pullQuote: "The money was never the inheritance, Sammie. This is.",
    scripture: {
      reference: "Proverbs 11:25",
      translation: "NIV",
      text: "A generous person will prosper; whoever refreshes others will be refreshed.",
    },
    momentsTitle: "What Gigi hopes Sammie carries",
    moments: [
      {
        title: "Give close enough to see faces",
        text: "Visit. Sit down. Learn names.",
      },
      {
        title: "Give your time first",
        text: "Time is what changed everything for Gigi.",
      },
      {
        title: "Give with open hands",
        text: "No name on the wall needed. Quiet counts.",
      },
      {
        title: "Let it make you glad",
        text: "Giving should feel like the best part of your week.",
      },
    ],
    next: null,
  },
];

export function hackathonDemoChapter(number: 1 | 2 | 3 | 4) {
  const chapter = hackathonDemoChapters.find((item) => item.number === number);
  if (!chapter) throw new Error("Unknown hackathon demo chapter.");
  return chapter;
}
