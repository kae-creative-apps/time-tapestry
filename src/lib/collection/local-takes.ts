import type { AnswerTake } from "./types";

const DATABASE = "time-tapestry-recordings";
const VERSION = 1;
export type LocalTake = AnswerTake & {
  collectionId: string;
  mimeType: string;
  audioMimeType?: string;
  state: "recording" | "local" | "backed_up";
  updatedAt: string;
};

type Chunk = { key: string; takeId: string; index: number; blob: Blob };
let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(
      new Error(
        "This browser cannot save recordings on this device. Try an updated browser or type your answer.",
      ),
    );
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const takes = db.createObjectStore("takes", { keyPath: "id" });
        takes.createIndex("collection", "collectionId");
        const chunks = db.createObjectStore("chunks", { keyPath: "key" });
        chunks.createIndex("take", "takeId");
        db.createObjectStore("drafts");
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        opening = undefined;
        reject(request.error ?? new Error("Device storage is unavailable."));
      };
      request.onblocked = () => {
        opening = undefined;
        reject(new Error("Close other Time Tapestry tabs, then try again."));
      };
    });
  }
  return opening;
}

async function read<T>(
  store: string,
  requestFor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = requestFor(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error("Could not read the recording saved on this device."),
      );
  });
}

async function write(
  store: string,
  apply: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error(
            "Device storage is full or unavailable. Download a backup before leaving.",
          ),
      );
    tx.onabort = () =>
      reject(tx.error ?? new Error("The device save was interrupted."));
    apply(tx.objectStore(store));
  });
}

export async function requestRecordingStorage(): Promise<boolean> {
  await database();
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function putLocalTake(take: LocalTake): Promise<void> {
  await write("takes", (store) => {
    store.put(take);
  });
}

export async function getLocalTake(
  takeId: string,
): Promise<LocalTake | undefined> {
  return read("takes", (store) => store.get(takeId));
}

export async function listLocalTakes(
  collectionId: string,
  questionId?: string,
): Promise<LocalTake[]> {
  const takes = await read<LocalTake[]>("takes", (store) =>
    store.index("collection").getAll(collectionId),
  );
  return takes
    .filter((take) => !questionId || take.questionId === questionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Device recovery does not require a collection link or a server request. */
export async function listAllLocalTakes(): Promise<LocalTake[]> {
  const takes = await read<LocalTake[]>("takes", (store) => store.getAll());
  return takes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Export keys and raw text together from one read-only storage snapshot. */
export async function listAllLocalDrafts(): Promise<
  { key: string; text: string }[]
> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const store = tx.objectStore("drafts");
    const keys = store.getAllKeys();
    const values = store.getAll();
    tx.oncomplete = () =>
      resolve(
        keys.result.flatMap((key, index) =>
          typeof key === "string" && typeof values.result[index] === "string"
            ? [{ key, text: values.result[index] as string }]
            : [],
        ),
      );
    tx.onerror = () =>
      reject(tx.error ?? new Error("Could not read saved written drafts."));
    tx.onabort = () =>
      reject(
        tx.error ?? new Error("Reading saved written drafts was interrupted."),
      );
  });
}

export async function appendTakeChunk(
  takeId: string,
  index: number,
  blob: Blob,
  durationSeconds?: number,
): Promise<void> {
  if (blob.size === 0) return;
  const chunk: Chunk = { key: `${takeId}:${index}`, takeId, index, blob };
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["chunks", "takes"], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error(
            "Device storage is full or unavailable. Download a backup before leaving.",
          ),
      );
    tx.onabort = () =>
      reject(tx.error ?? new Error("The device save was interrupted."));
    tx.objectStore("chunks").put(chunk);
    if (durationSeconds !== undefined) {
      const takeRequest = tx.objectStore("takes").get(takeId);
      takeRequest.onsuccess = () => {
        if (takeRequest.result)
          tx.objectStore("takes").put({
            ...takeRequest.result,
            durationSeconds: Math.max(
              takeRequest.result.durationSeconds ?? 0,
              durationSeconds,
            ),
            updatedAt: new Date().toISOString(),
          });
      };
    }
  });
}

export async function getTakeBlob(
  take: Pick<LocalTake, "id" | "mimeType">,
): Promise<Blob> {
  const chunks = await read<Chunk[]>("chunks", (store) =>
    store.index("take").getAll(take.id),
  );
  chunks.sort((a, b) => a.index - b.index);
  if (!chunks.length)
    throw new Error("No recorded audio or video was saved for this take.");
  return new Blob(
    chunks.map((chunk) => chunk.blob),
    { type: take.mimeType },
  );
}

export async function saveTextDraft(
  collectionId: string,
  questionId: string,
  text: string,
): Promise<void> {
  await write("drafts", (store) => {
    store.put(text, `${collectionId}:${questionId}`);
  });
}

export async function getTextDraft(
  collectionId: string,
  questionId: string,
): Promise<string> {
  return (
    (await read<string | undefined>("drafts", (store) =>
      store.get(`${collectionId}:${questionId}`),
    )) ?? ""
  );
}

export function recordingExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function answerFromLocal(take: LocalTake): AnswerTake {
  const {
    collectionId: _collectionId,
    mimeType: _mimeType,
    audioMimeType: _audioMimeType,
    state: _state,
    updatedAt: _updatedAt,
    ...answer
  } = take;
  return answer;
}
