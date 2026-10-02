import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

export type SessionStatus =
  | 'created'
  | 'interview_started'
  | 'interview_complete'
  | 'approved'
  | 'delivered';

export type InitiationPath = 'request' | 'share' | 'invite';

export type ReplyType = 'text' | 'voice' | 'video';

export type GrandchildAction = 'continue' | 'serve' | 'give';

export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  initiationPath: InitiationPath;
  grandchild: { name: string; email: string };
  grandparent: { name: string; email: string };
  familyId?: string;
  familyName?: string;
  invite?: {
    name: string;
    email?: string;
    note?: string;
  };
  voiceIntroUrl?: string;
  interview: {
    transcript: Array<{
      role: 'ai' | 'grandparent';
      content: string;
      timestamp: string;
    }>;
    currentQuestion: number;
    startedAt?: string;
    completedAt?: string;
  };
  videoUrl?: string;
  story: {
    chapters: Array<{
      title: string;
      content: string;
      audioUrl?: string;
    }>;
    welcomeNote: string;
    causes: string[];
    values: string[];
    keyQuotes: string[];
    generatedAt?: string;
    approvedAt?: string;
  };
  grandchildReply?: {
    type: ReplyType;
    content: string;
    mediaUrl?: string;
    submittedAt: string;
  };
  grandchildAction?: {
    action: GrandchildAction;
    submittedAt: string;
  };
  postcardsScheduled?: Array<{
    pscId: string;
    sendDate: string;
    chapterIndex: number;
  }>;
};

const SESSION_PREFIX = 'session:';

// deliberate: in-memory fallback for local dev when Vercel KV env vars are absent
const memoryStore = new Map<string, Session>();

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function useMemoryFallback(): boolean {
  return !process.env.KV_URL || !process.env.KV_REST_API_TOKEN;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function familyIdFromGrandparentName(name?: string): string {
  const lastName = name?.trim().split(/\s+/).pop();
  if (lastName) {
    return `${slugify(lastName)}-${nanoid(4)}`;
  }
  return nanoid(12);
}

function familyNameFromGrandparentName(name?: string): string {
  const lastName = name?.trim().split(/\s+/).pop();
  if (lastName) {
    return `${lastName} Family`;
  }
  return 'Your Family';
}

export async function ensureSessionsDir(): Promise<void> {
  // deliberate: KV and the in-memory Map do not need a filesystem directory
}

export async function createSession(
  partial: Omit<
    Session,
    'id' | 'createdAt' | 'updatedAt' | 'status' | 'interview' | 'story'
  >
): Promise<Session> {
  const now = new Date().toISOString();
  const familyId = partial.familyId || familyIdFromGrandparentName(partial.grandparent?.name);
  const familyName = partial.familyName || familyNameFromGrandparentName(partial.grandparent?.name);
  const session: Session = {
    ...partial,
    familyId,
    familyName,
    id: nanoid(12),
    status: 'created',
    interview: {
      transcript: [],
      currentQuestion: 0
    },
    story: {
      chapters: [],
      welcomeNote: '',
      causes: [],
      values: [],
      keyQuotes: []
    },
    createdAt: now,
    updatedAt: now
  };

  const key = sessionKey(session.id);

  if (useMemoryFallback()) {
    memoryStore.set(key, session);
    return session;
  }

  await kv.set(key, session);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const key = sessionKey(id);

  if (useMemoryFallback()) {
    return memoryStore.get(key) || null;
  }

  return kv.get<Session>(key);
}

export async function updateSession(
  id: string,
  updater: (session: Session) => Session
): Promise<Session | null> {
  const session = await getSession(id);
  if (!session) return null;
  const updated = updater(session);
  updated.updatedAt = new Date().toISOString();

  const key = sessionKey(id);

  if (useMemoryFallback()) {
    memoryStore.set(key, updated);
    return updated;
  }

  await kv.set(key, updated);
  return updated;
}

export async function listSessions(): Promise<Session[]> {
  if (useMemoryFallback()) {
    return Array.from(memoryStore.values());
  }

  // deliberate: linear scan of session keys; acceptable until session volume is large
  const keys = await kv.keys(`${SESSION_PREFIX}*`);
  const sessions = await Promise.all(
    keys.map((key) => kv.get<Session>(key))
  );
  return sessions.filter((s): s is Session => s !== null);
}

export async function listSessionsByFamilyId(familyId: string): Promise<Session[]> {
  const all = await listSessions();
  return all.filter((s) => s.familyId === familyId);
}

export async function deleteSession(id: string): Promise<boolean> {
  const key = sessionKey(id);

  if (useMemoryFallback()) {
    return memoryStore.delete(key);
  }

  await kv.del(key);
  return true;
}
