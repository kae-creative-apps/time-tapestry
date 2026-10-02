export type DemoStory = {
  id: string;
  grandparent: { name: string; email: string };
  grandchild: { name: string; email: string };
  welcomeNote: string;
  chapters: Array<{ title: string; content: string; audioUrl?: string }>;
  causes: string[];
  values: string[];
  keyQuotes: string[];
};

export const demoStory: DemoStory = {
  id: 'demo-gigi',
  grandparent: { name: "Eleanor 'Gigi' Mitchell", email: 'gigi@example.com' },
  grandchild: { name: 'Sammie', email: 'sammie@example.com' },
  welcomeNote:
    "Sammie, this is your Gigi. I sat down with a cup of tea and a recorder and told some stories I never want you to forget. They are small stories, mostly. But small stories are the ones that hold a family together. I love you more than biscuits.",
  chapters: [
    {
      title: 'The Coat on the Porch',
      content:
        "One winter morning, your great-grandmother left a coat on the porch for a girl who walked past our house on her way to school. I was twelve. I asked Mama why, and she said, 'Because she was cold, and we had two.' I have never forgotten the way that girl looked at our door. That was the first time I understood that generosity is a kind of noticing. You do not have to be rich to be generous. You only have to pay attention."
    },
    {
      title: 'Giving Started at the Table',
      content:
        "In our house, giving started at the supper table. We set an extra plate when we could, and Mama taught us that hospitality was not a special occasion. It was the way we lived. I learned that giving mattered because it happened before I had words for it. It happened in the steam off the potatoes and the second helping passed to a neighbor. Your great-grandfather used to say, 'The table is long enough if you pull up another chair.'"
    },
    {
      title: 'What I Keep Supporting',
      content:
        "I believe in our local food pantry, the children's literacy fund at our church, and the missionaries in Honduras we have supported for twenty years. These are not just causes. They are people I have prayed for by name. I give because I was once the child who needed the coat, and someone noticed me. I want my giving to keep noticing people long after I am gone."
    },
    {
      title: 'What I Hope You Remember',
      content:
        "Sammie, I hope you remember that a good life does not have to be loud. It can be a letter, a meal, a coat on a porch. I hope you remember that faith, family, and paying attention matter more than having much. That is the life I tried to live. That is the life I am handing down to you. When you give someday, give in your own name, in your own way. Just do not forget to notice."
    }
  ],
  causes: [
    'Our local food pantry — because empty cupboards are a quiet emergency',
    "The children's literacy fund at our church — every child deserves a book that feels like theirs",
    'Missionaries in Honduras we have supported for twenty years — they are family now'
  ],
  values: [
    'Faith',
    'Family',
    'Generosity',
    'Hospitality',
    'Noticing the people around you',
    'Paying attention before you have words for it'
  ],
  keyQuotes: [
    'Because she was cold, and we had two.',
    'The table is long enough if you pull up another chair.',
    'You do not have to be rich to be generous. You only have to pay attention.',
    'A good life does not have to be loud.'
  ]
};

export function getDemoStory(): DemoStory {
  return demoStory;
}
