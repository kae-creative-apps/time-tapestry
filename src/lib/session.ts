import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
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

const sessionsDir = path.join(process.cwd(), 'src', 'data', 'sessions');

function sessionFilePath(id: string) {
  return path.join(sessionsDir, `${id}.json`);
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
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true });
  }
}

export async function createSession(
  partial: Omit<
    Session,
    'id' | 'createdAt' | 'updatedAt' | 'status' | 'interview' | 'story'
  >
): Promise<Session> {
  await ensureSessionsDir();
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
  await writeFile(sessionFilePath(session.id), JSON.stringify(session, null, 2));
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  try {
    const raw = await readFile(sessionFilePath(id), 'utf-8');
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function updateSession(
  id: string,
  updater: (session: Session) => Session
): Promise<Session | null> {
  const session = await getSession(id);
  if (!session) return null;
  const updated = updater(session);
  updated.updatedAt = new Date().toISOString();
  await writeFile(sessionFilePath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function listSessions(): Promise<Session[]> {
  await ensureSessionsDir();
  const entries = await readdir(sessionsDir);
  const files = entries.filter((f) => f.endsWith('.json'));
  const sessions: Session[] = [];
  for (const file of files) {
    const session = await getSession(file.replace('.json', ''));
    if (session) sessions.push(session);
  }
  return sessions;
}

export async function listSessionsByFamilyId(familyId: string): Promise<Session[]> {
  const all = await listSessions();
  return all.filter((s) => s.familyId === familyId);
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const { unlink } = await import('fs/promises');
    await unlink(sessionFilePath(id));
    return true;
  } catch {
    return false;
  }
}
