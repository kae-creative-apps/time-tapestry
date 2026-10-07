// Fictional demo family for the hackathon. Gigi, Sammie and every voice in
// these films are illustrative; no real interview or recording is used.

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
  replyPrompt: string;
  next: { href: string; label: string; teaser: string } | null;
};

export const HACKATHON_DEMO_STORYTELLER = {
  fullName: "Margaret “Gigi” Ellis",
  firstName: "Gigi",
  age: 73,
  hometown: "Dayton, Ohio",
  recipient: "Sammie",
  recipientDescription: "her granddaughter, 16",
} as const;

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
        "Someone once gave me their afternoons when I needed them most. Time is the best gift you can give.",
    },
    question:
      "Tell me about someone whose kindness has stayed with you all these years.",
    conversation: [
      {
        speaker: "interviewer",
        text: "Gigi, tell me about someone whose kindness has stayed with you all these years. Take your time.",
      },
      {
        speaker: "gigi",
        text: "Oh... [sighs] well, that one's easy. Mrs. Hale. [pause] I was nine, and I was so sick I couldn't get out of bed. Mom was working two shifts. And every afternoon at three o'clock there'd be a knock, and it was Mrs. Hale with a pot of soup. [pause] It was rheumatic fever. Almost three months in that bed. Dad had just lost his job at the mill, so he was out every day looking for work, and that house was so quiet. [chuckles] I counted the cracks in the ceiling. I knew every one of them.",
      },
      {
        speaker: "interviewer",
        text: "What do you remember most about those afternoons?",
      },
      {
        speaker: "gigi",
        text: "Well, she'd just... come right in. Put that pot on our stove like she lived there. Then she'd pull a chair up by my bed and read to me. Every afternoon, all winter. [pause] And when I could finally sit up, she put me on a little stool in the kitchen and taught me to make bread. I still use her recipe. [chuckles] You've had it, honey. [pause] She never once said what it cost her. People bring a casserole and leave, and that's kind. But Mrs. Hale stayed. [softly] That was the gift.",
      },
    ],
    transcript:
      "I was nine, and I was so sick I couldn't get out of bed. Mom was working two shifts. And every afternoon at three o'clock there'd be a knock, and it was Mrs. Hale with a pot of soup.",
    story: `The winter I turned nine, I came down with rheumatic fever. The doctor said bed rest, and he meant it. I was in that bed for almost three months.

Your great-grandmother was working double shifts at the hospital laundry, and Dad had just lost his job at the paper mill, so he was out every day looking for work. The house was very quiet. I remember counting the cracks in the ceiling.

Then one afternoon there was a knock. It was Mrs. Hale from church. She was a widow, older than my mother, and I barely knew her. She came in, put a pot on our stove and started making soup like she lived there. Then she pulled a chair up next to my bed and read to me.

She came back the next day, and the day after that. Every afternoon, all winter. When I was well enough to sit up, she put me on a stool in the kitchen and taught me to make bread. I still use her recipe.

She never once mentioned what it cost her. She had her own life and her own troubles, and I found out much later that she had her own aches too. But she gave me her afternoons, and she stayed.

I've thought about her my whole life, Sammie. People bring a casserole and leave, and that's kind. But Mrs. Hale stayed. That was the gift.`,
    pullQuote:
      "She didn't bring a casserole and leave. She stayed. That was the gift.",
    scripture: {
      reference: "1 Peter 4:10",
      translation: "NIV",
      text: "Each of you should use whatever gift you have received to serve others.",
    },
    momentsTitle: "Three key moments",
    moments: [
      {
        title: "The quiet house",
        text: "Three months in bed, counting the cracks in the ceiling.",
      },
      {
        title: "Three o'clock",
        text: "Mrs. Hale's knock, and soup on the stove.",
      },
      {
        title: "The kitchen stool",
        text: "Learning to knead bread as she got well.",
      },
    ],
    replyPrompt: "Who has given you their time when you needed it?",
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
      message:
        "Hard seasons come. Hold on to this: there is new mercy every morning.",
    },
    question: "Can you tell me about a time your faith carried you through?",
    conversation: [
      {
        speaker: "interviewer",
        text: "Can you tell me about a time your faith carried you through something hard?",
      },
      {
        speaker: "gigi",
        text: "[exhales] Yes. I grew up in church, but I don't think my faith was really mine until nineteen seventy-seven. Walt and I had been married three years. [pause] Your Uncle Danny came eight weeks early. I'd sit at that kitchen table at two in the morning, and I didn't have fancy prayers. I just said, 'Help.' And every morning, somehow, there was enough. [pause] Not enough for the whole week. Just... enough for that day. He was so small. Six weeks in the hospital, and we didn't know if he was coming home.",
      },
      {
        speaker: "interviewer",
        text: "Was there anyone who helped carry you through that season?",
      },
      {
        speaker: "gigi",
        text: "Oh, the church. [chuckles] Families brought us dinner every single night for six weeks. I thought about Mrs. Hale a lot that winter. Now I was the one being carried. [pause] And Danny came home. He's six-foot-two now, so. [laughs] [pause] When we lost your grandpa, I went back to that same table. I'll be honest, it was harder that time. [softly] But I knew where to sit, and I knew what to say. And the mornings kept coming. [pause] Faith hasn't made my life easy, Sammie. It just means I never had to face it alone.",
      },
    ],
    transcript:
      "Your Uncle Danny came eight weeks early. I'd sit at that kitchen table at two in the morning, and I didn't have fancy prayers. I just said, 'Help.' And every morning, somehow, there was enough.",
    story: `I grew up in church, but I'm not sure my faith was really mine until 1977.

Your grandpa Walt and I had been married three years when your Uncle Danny came eight weeks early. He was so small. He spent six weeks in the hospital, and we didn't know if he'd come home.

I'd sit at our kitchen table at two in the morning with a cup of coffee going cold, and I'd pray. Nothing fancy. Mostly just "help." I wasn't strong, and I didn't feel brave. But every morning I woke up and there was enough strength for that day. Not for the whole week, just that day.

And people showed up. Families from church brought dinner every night for six weeks. I thought about Mrs. Hale a lot that winter. Now I was the one being carried.

Danny came home. He's six-foot-two now, as you know.

When we lost your grandpa in 2015, I went back to that same kitchen table. I'll be honest with you: it was harder that time. But I knew where to sit, and I knew what to say. And the mornings kept coming.

Faith hasn't made my life easy, Sammie. It has meant I never had to face it alone.`,
    pullQuote:
      "I didn't always feel strong. But every morning there was enough mercy for that day.",
    scripture: {
      reference: "Lamentations 3:22–23",
      translation: "ESV",
      text: "His mercies never come to an end; they are new every morning; great is your faithfulness.",
    },
    momentsTitle: "Three key moments",
    moments: [
      {
        title: "Two in the morning",
        text: "Prayers at the kitchen table while Danny was in the hospital.",
      },
      {
        title: "Six weeks of dinners",
        text: "Church families who carried Gigi the way Mrs. Hale once had.",
      },
      {
        title: "The same table",
        text: "Losing Walt, and the mornings that kept coming.",
      },
    ],
    replyPrompt: "What helps you hold on when things are hard?",
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
      message: "The good you sow can keep growing long after you see it.",
    },
    question: "What's something you gave your time to that you're proud of?",
    conversation: [
      {
        speaker: "interviewer",
        text: "What's something you gave your time to that you're proud of?",
      },
      {
        speaker: "gigi",
        text: "[chuckles] Oh, the Wednesday suppers. Our church started them in nineteen eighty-eight, and somehow I ended up running the whole thing. Thirty-one years of Wednesday suppers. I always set one more chair than we had people. Somebody always came to sit in it. [pause] Soup, bread, and whoever walked in the door. And I kept a list on the refrigerator... anybody who was sick, or just home from the hospital, or having a hard time. I'd make a pot of soup and take it over and sit a while. I learned that from Mrs. Hale. The soup was never really the point.",
      },
      {
        speaker: "interviewer",
        text: "Did you ever get to see what that meant to someone?",
      },
      {
        speaker: "gigi",
        text: "[pause] Once. About ten years ago, a young woman came up to me after supper. She said when she was little, her dad had surgery and couldn't work, and I brought soup to their house every Tuesday that winter. And she said that soup kept her family going. [softly] I didn't even remember her. But she remembered me. [pause] We never had a lot of money, Sammie. Mostly I gave time. Turns out that's the thing people remember. You plant things you'll never see grow. Sometimes God lets you see one.",
      },
    ],
    transcript:
      "Thirty-one years of Wednesday suppers. I always set one more chair than we had people. Somebody always came to sit in it.",
    story: `In 1988, our church started a Wednesday night supper, and somehow I ended up running it. I did it for thirty-one years.

It was simple: soup, bread and whoever walked in. Members, neighbors, people passing through. I always set one more chair than we had people, and I can't remember a week when nobody came to sit in it.

I also kept a list on the refrigerator of anyone in the congregation who was sick, just home from the hospital, or just having a hard time. I'd make a pot of soup, bring it over and stay a while. I learned that from Mrs. Hale. The soup was never really the point.

We didn't have a lot of money, Sammie. Your grandpa and I gave what we could, and sometimes a little more than we strictly had. But mostly I gave time. It turns out that's the thing people remember.

About ten years ago, a young woman came up to me after supper. She said that when she was little, her dad had surgery and couldn't work, and I brought soup to their house every Tuesday that winter. She said that soup was the thing that kept her family going. I didn't even remember her. But she remembered me.

You plant things you'll never see grow. Sometimes God lets you see one.`,
    pullQuote:
      "You plant things you'll never see grow. Sometimes God lets you see one.",
    scripture: {
      reference: "Galatians 6:9",
      translation: "NIV",
      text: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.",
    },
    momentsTitle: "Three key moments",
    moments: [
      {
        title: "Wednesday supper",
        text: "Soup, bread and one extra chair for 31 years.",
      },
      {
        title: "The list",
        text: "Meals and afternoons for anyone who was sick or struggling.",
      },
      {
        title: "The thank-you",
        text: "A grown woman who remembered Gigi's Tuesday soup.",
      },
    ],
    replyPrompt: "Who could you give an afternoon to this month?",
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
      message:
        "Keep your table open. There is always room for one more chair.",
    },
    question:
      "If Sammie could carry one thing from your life with her, what would you want it to be?",
    conversation: [
      {
        speaker: "interviewer",
        text: "If Sammie could carry one thing from your life with her, what would you want it to be?",
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
        text: "[softly] Okay. Sammie, this part is just for you. [pause] I told you about Mrs. Hale. About that kitchen table at two in the morning, and all those Wednesday suppers. I didn't tell you so you'd think your Gigi was something special. [chuckles] I told you so you'd know where it all came from. And that it can keep going. [pause] So. Show up, and stay a while. You don't need the right words. Most of the time, people just need somebody to sit with them. [pause] Keep your table open. Whatever kind of table you end up with, make it long enough for one more chair. [pause] When you're scared, take it one morning at a time. You don't have to have the whole road figured out. There'll be enough for today. [pause] And give in your own way. It doesn't have to be loud, and nobody has to know. Quiet counts. [pause] Sammie, you already know how to sit with people. I've watched you do it. Don't ever let anybody tell you that's a small thing. You did it with your little brother. And with me, after Grandpa died. [pause] [softly] I love you. I'm proud of you. [chuckles] Now go make some soup for somebody.",
      },
    ],
    transcript:
      "Sammie, you already know how to sit with people. I've watched you do it. Don't ever let anybody tell you that's a small thing.",
    story: `Sammie, this part is just for you.

I've told you about Mrs. Hale, about the kitchen table at two in the morning, and about all those Wednesday suppers. I didn't tell you those stories so you'd think your Gigi was something special. I told you because I want you to know where it all came from, and that it can keep going.

Here's what I hope you carry:

Show up, and stay a while. You don't need the right words. Most of the time, people just need someone to sit with them. Time is the gift.

Keep your table open. Whatever kind of table you end up with, make it long enough for one more chair. Somebody will always need it.

When you're scared, take one morning at a time. You don't have to have the whole road figured out. There will be enough mercy for today.

Give in your own way. It doesn't have to be loud or big, and nobody needs to know about it. Quiet counts.

You already know how to sit with people, Sammie. I've watched you do it with your little brother, and with me since Grandpa died. Don't ever let anybody tell you that's a small thing.

I love you. I'm proud of you. Now go make some soup for somebody.`,
    pullQuote:
      "Sammie, you already know how to sit with people. Don't ever think that's small.",
    scripture: {
      reference: "Matthew 25:40",
      translation: "NIV",
      text: "Truly I tell you, whatever you did for one of the least of these brothers and sisters of mine, you did for me.",
    },
    momentsTitle: "What Gigi hopes Sammie carries",
    moments: [
      {
        title: "Show up, and stay a while",
        text: "You don't need the right words. Time is the gift.",
      },
      {
        title: "Keep your table open",
        text: "Make it long enough for one more chair.",
      },
      {
        title: "Take one morning at a time",
        text: "There will be enough mercy for today.",
      },
      {
        title: "Give in your own way",
        text: "It doesn't have to be loud. Quiet counts.",
      },
    ],
    replyPrompt: "What do you want to carry forward from Gigi's story?",
    next: null,
  },
];

export function hackathonDemoChapter(number: 1 | 2 | 3 | 4) {
  const chapter = hackathonDemoChapters.find((item) => item.number === number);
  if (!chapter) throw new Error("Unknown hackathon demo chapter.");
  return chapter;
}
