/** Local preview of the keepsake book. Does not upload or queue anything. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  renderStoryBook,
  storyBookSnapshot,
} from "../src/lib/collection/story-book";
import type { Collection } from "../src/lib/collection/types";

const collectionPath = process.argv[2];
const output = process.argv[3];
const stillDir = process.argv[4];
if (!collectionPath || !output) {
  throw new Error(
    "Usage: render-story-book-preview.ts <collection.json> <output.pdf> [still-dir]",
  );
}

async function main() {
  const loaded = JSON.parse(await readFile(collectionPath, "utf8")) as {
    collection?: Collection;
  };
  const collection = loaded.collection ?? (loaded as unknown as Collection);
  const book = storyBookSnapshot(
    collection,
    collection.recipient.name.trim() || "you",
  );
  if (stillDir) {
    for (const chapter of book.chapters) {
      try {
        chapter.still = await readFile(
          path.join(stillDir, `${chapter.id}.jpg`),
        );
      } catch {
        // A missing frame leaves the drawn chapter header in place.
      }
    }
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await renderStoryBook(book));
}

main();
