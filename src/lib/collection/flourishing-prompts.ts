/** Original memory prompts inspired by Gloo's seven flourishing dimensions.
 * These are conversation invitations, not a wellbeing assessment or advice. */
export const FLOURISHING_CATEGORIES = [
  { id: "character", name: "Character", description: "The choices that shaped you" },
  { id: "health", name: "Health", description: "Care, strength and everyday life" },
  { id: "relationships", name: "Relationships", description: "The people who made a difference" },
  { id: "finances", name: "Finances", description: "Work, enough and generosity" },
  { id: "happiness", name: "Happiness", description: "The things that brought you joy" },
  { id: "meaning", name: "Meaning", description: "What gave your life purpose" },
  { id: "faith", name: "Faith", description: "Belief, prayer and hope" },
] as const;
export type FlourishingCategory = (typeof FLOURISHING_CATEGORIES)[number]["id"];
export type FlourishingPrompt = {
  id: string;
  category: FlourishingCategory;
  title: string;
  question: string;
};

const questions: Record<FlourishingCategory, readonly (readonly [string, string])[]> = {
  character: [
    ["Keeping your word", "Tell me about a time keeping a promise mattered to you."],
    ["An honest choice", "Can you remember a time you chose honesty even though it was difficult?"],
    ["Courage in a small moment", "What is a small act of courage from your life that your family might not know about?"],
    ["Someone you looked up to", "Who showed you the kind of person you wanted to become, and what did you see them do?"],
    ["Changing your mind", "Tell me about a time you changed your mind after listening to someone."],
    ["Learning patience", "What experience taught you patience?"],
    ["A lesson from a mistake", "What is a mistake you feel comfortable sharing that taught you something lasting?"],
    ["Doing the quiet work", "Tell me about something good you did when nobody was watching."],
    ["Standing beside someone", "When did you stand beside someone who needed support?"],
    ["Receiving forgiveness", "If you would like to share it, when did someone's forgiveness make a difference to you?"],
    ["Starting again", "Tell me about a time you had to begin again and how you took the first step."],
    ["A family value", "What value did your family practice in everyday life, and what did that look like?"],
    ["Learning humility", "Who taught you that you still had something to learn?"],
    ["Making things right", "Tell me about a time you tried to make something right after it went wrong."],
    ["What you hope we practice", "What everyday habit would you love to see the next generation carry forward?"],
  ],
  health: [
    ["A day outdoors", "Tell me about a day outdoors that you still remember fondly."],
    ["Learning to rest", "When did you learn that it was all right to rest?"],
    ["Being cared for", "Who cared for you during a difficult season, and what small thing they did stays with you?"],
    ["A comforting routine", "What everyday routine has helped you feel steady?"],
    ["Finding your strength", "Tell me about a time you discovered strength you did not know you had."],
    ["Asking for help", "If you feel comfortable sharing, what helped you ask for support when you needed it?"],
    ["A meal that meant care", "What meal do you remember as an expression of someone's care?"],
    ["Moving for joy", "What kind of movement, sport or activity have you enjoyed, and what memory goes with it?"],
    ["Caring for someone", "Tell me about a time you cared for someone and what you learned from being with them."],
    ["A gentler pace", "Was there a season when you changed the pace of your life, and what was that like?"],
    ["Making room to breathe", "Where have you gone to find a little quiet when life felt full?"],
    ["An ordinary good day", "What does an ordinary good day look like for you?"],
    ["Small comforts", "What simple comfort has helped you through a hard day?"],
    ["Care you hope we remember", "What have your experiences taught you about treating yourself and others with care?"],
  ],
  relationships: [
    ["How a friendship began", "Tell me how one of your lasting friendships began."],
    ["Feeling at home", "Who made you feel at home, and how did they do it?"],
    ["A person from childhood", "Which person from your childhood would you like your family to know about?"],
    ["A welcome you remember", "Tell me about a time someone welcomed you when you felt like a stranger."],
    ["Words that stayed", "What words from someone you love have stayed with you?"],
    ["A family tradition", "What family tradition would you like to tell the story behind?"],
    ["A teacher or mentor", "Who helped you see something in yourself that you had not seen yet?"],
    ["Showing up", "Tell me about a time someone's presence mattered more than anything they could say."],
    ["Something we laughed about", "What shared moment still makes you and someone you love laugh?"],
    ["Love in everyday life", "How has someone shown you love through ordinary daily actions?"],
    ["Listening differently", "Tell me about a conversation that helped you understand someone better."],
    ["A neighbor's kindness", "What is a memory of a neighbor or community member looking out for you?"],
    ["Learning from a younger person", "What has a younger person in your life taught you?"],
    ["Remembering someone", "If you would like to, tell me a small story about someone you miss."],
    ["What I love about you", "What would you like the people receiving these stories to know you appreciate about them?"],
  ],
  finances: [
    ["Your first job", "What do you remember about your first job and the people you worked with?"],
    ["Learning what enough means", "Was there an experience that changed what having enough meant to you?"],
    ["A generous gift", "Tell me about a gift you received that meant more than its price."],
    ["Saving for something", "What is something you worked or saved toward, and why did it matter to you?"],
    ["Making do", "What is a family story about making do with what you had?"],
    ["Learning about work", "Who taught you something valuable about work?"],
    ["Sharing what you had", "Tell me about a time you shared what you had with someone."],
    ["A treasured object", "What object do you treasure because of its story rather than its value?"],
    ["A different kind of wealth", "When have you felt rich in something that money cannot buy?"],
    ["A lesson about spending", "What experience taught you something about choosing what was worth spending on?"],
    ["Working together", "Tell me about a time your family or community worked together to meet a need."],
    ["An act of hospitality", "What is a memory of offering hospitality with whatever you had available?"],
    ["Time as a gift", "When did giving your time become especially meaningful to you?"],
    ["What you hope we value", "What would you like the next generation to remember about money, work and caring for people?"],
  ],
  happiness: [
    ["A joyful childhood memory", "What is a happy memory from childhood you would enjoy telling again?"],
    ["A song and its story", "What song takes you back to a particular moment in your life?"],
    ["Your kind of celebration", "Tell me about a celebration that felt especially meaningful to you."],
    ["An unexpected delight", "What unexpected little thing once made your day?"],
    ["Something you made", "Tell me about something you made, grew or created that brought you joy."],
    ["A favorite place", "What place brings you happy memories, and what happened there?"],
    ["A funny family story", "What funny family story would you like to preserve in your own words?"],
    ["Trying something new", "When did trying something new bring you more joy than you expected?"],
    ["A simple pleasure", "What simple pleasure have you returned to throughout your life?"],
    ["A day you would revisit", "What day would you enjoy experiencing once more, and what do you remember about it?"],
    ["A beloved pastime", "How did you first discover a hobby or pastime you love?"],
    ["A season you enjoyed", "What season of your life do you remember with particular fondness?"],
    ["A moment of gratitude", "Tell me about a moment when you stopped and felt grateful."],
    ["Joy to pass along", "What would you love your family to try, notice or enjoy because it has brought you joy?"],
  ],
  meaning: [
    ["A turning point", "Tell me about a moment that changed the direction of your life."],
    ["Work that mattered", "When did something you were doing feel especially worthwhile?"],
    ["Finding your place", "Tell me about a time you felt you belonged or had something to contribute."],
    ["A dream that changed", "How has a dream of yours changed as you have lived?"],
    ["A quiet contribution", "What is something you contributed that may never have received much attention?"],
    ["A cause close to you", "What person, community or cause became important to you, and how did that begin?"],
    ["What you kept choosing", "What have you kept making room for, even when life was busy?"],
    ["Learning through change", "What did a major change in your life teach you about what mattered most?"],
    ["An unfinished hope", "Is there a hope or dream you would still like to share with your family?"],
    ["Something worth teaching", "What skill or lesson have you enjoyed passing on to someone else?"],
    ["Looking back differently", "What part of your life do you understand differently now than you did then?"],
    ["The story behind a choice", "What important choice would you like your family to understand the story behind?"],
    ["Remember me in this moment", "What ordinary moment from your life would you like your family to picture when they think of you?"],
    ["What you hope carries on", "What do you hope continues through the people whose lives have touched yours?"],
  ],
  faith: [
    ["A first memory of faith", "If you would like to share, what is one of your earliest memories of faith?"],
    ["A prayer for your family", "Is there a prayer you would like to speak for the people receiving these stories?"],
    ["Faith in a choice", "Tell me about a decision your faith helped you make and what followed."],
    ["Someone who lived their faith", "Who helped you understand faith through the way they treated people?"],
    ["Hope in a hard season", "If you feel comfortable sharing, what gave you hope during a difficult season?"],
    ["A Scripture and its memory", "Is there a Scripture that matters to you because of something you experienced?"],
    ["A place of worship", "What memory from a church or faith community would you like to preserve?"],
    ["A question you carried", "Is there a question about faith you have carried and would like to talk about?"],
    ["A practice that steadied you", "What spiritual practice, if any, has helped you feel grounded?"],
    ["Grace you experienced", "Tell me about a time you experienced grace through another person."],
    ["Serving together", "What do you remember about serving others alongside people from your faith community?"],
    ["A hymn or song", "Is there a hymn or worship song connected to a meaningful memory for you?"],
    ["Faith over the years", "How has the way you understand or practice your faith changed over the years?"],
    ["A blessing to carry", "What blessing or words of hope would you like to leave for your family?"],
  ],
};

export const FLOURISHING_PROMPTS: readonly FlourishingPrompt[] =
  FLOURISHING_CATEGORIES.flatMap(({ id: category }) =>
    questions[category].map(([title, question], index) => ({
      id: `${category}-${String(index + 1).padStart(2, "0")}`,
      category,
      title,
      question,
    })),
  );

export const flourishingPrompt = (id: string) =>
  FLOURISHING_PROMPTS.find((prompt) => prompt.id === id);
