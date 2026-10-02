import OpenAI from 'openai';

const apiKey = process.env.GLOO_API_KEY;

export const gloo = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: 'https://platform.ai.gloo.com/ai/v2/guarded'
    })
  : null;

export async function chat(
  messages: Array<{ role: string; content: string }>,
  options?: { stream?: boolean; tradition?: string }
) {
  if (!gloo) {
    return mockChatResponse(messages);
  }

  const response = await gloo.chat.completions.create({
    model: process.env.GLOO_MODEL || 'gloo-google-gemini-2.5-flash',
    messages: messages as Array<OpenAI.Chat.ChatCompletionMessageParam>,
    stream: options?.stream || false,
    tradition: options?.tradition || 'evangelical'
  } as OpenAI.Chat.ChatCompletionCreateParams);

  return response;
}

function mockChatResponse(messages: Array<{ role: string; content: string }>) {
  const lastMsg = messages[messages.length - 1]?.content || '';
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: getMockResponse(lastMsg)
        }
      }
    ]
  };
}

function getMockResponse(lastMessage: string): string {
  const lower = lastMessage.toLowerCase();
  if (lower.includes('story')) {
    return "That's a beautiful story. Can you tell me more about what it meant to you?";
  }
  if (lower.includes('giving') || lower.includes('generous')) {
    return 'It sounds like giving was woven into the ordinary moments. What was one of the first times you noticed that?';
  }
  if (lower.includes('cause') || lower.includes('believe')) {
    return 'Those causes say a lot about what you value. How did they first find you?';
  }
  if (lower.includes('grandchild') || lower.includes('hope')) {
    return 'I hear how much you care about them. What do you want them to remember about you?';
  }
  return 'Thank you for sharing that. Take your time. I am listening.';
}
