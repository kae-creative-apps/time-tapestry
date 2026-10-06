import type { Collection } from "../collection/types";
import type {
  Chapter,
  ChapterCreate,
  ChapterUpdate,
  PrintOrder,
  PrintOrderCreate,
  PrintOrderUpdate,
  Recipient,
  RecipientCreate,
  RecipientUpdate,
  Revision,
  Story,
  StoryCreate,
  StoryUpdate,
  Take,
  TakeCreate,
  TakeUpdate,
} from "./schema";

export type MutationOptions = { expectedRevision?: Revision };
export type MutationResult<T> = { value: T; revision: Revision };
export interface ScopedRepository<Row, Create, Update> {
  list(storyId: string): Promise<Row[]>;
  get(storyId: string, id: string): Promise<Row | null>;
  create(
    storyId: string,
    input: Create,
    options?: MutationOptions,
  ): Promise<MutationResult<Row>>;
  update(
    storyId: string,
    id: string,
    input: Update,
    options?: MutationOptions,
  ): Promise<MutationResult<Row>>;
  delete(
    storyId: string,
    id: string,
    options?: MutationOptions,
  ): Promise<MutationResult<null>>;
}
/** Server-side persistence only. Callers must authorize access and validate domain transitions. */
export interface DatabaseAdapter {
  readonly kind: "collection-kv-compatible" | "relational";
  stories: {
    get(id: string): Promise<Story | null>;
    create(input: StoryCreate): Promise<MutationResult<Story>>;
    update(
      id: string,
      input: StoryUpdate,
      options?: MutationOptions,
    ): Promise<MutationResult<Story>>;
    /** Soft deletion preserves private media and delivery evidence. */
    delete(
      id: string,
      options?: MutationOptions,
    ): Promise<MutationResult<null>>;
  };
  chapters: ScopedRepository<Chapter, ChapterCreate, ChapterUpdate>;
  takes: ScopedRepository<Take, TakeCreate, TakeUpdate>;
  recipients: ScopedRepository<Recipient, RecipientCreate, RecipientUpdate>;
  printOrders: ScopedRepository<PrintOrder, PrintOrderCreate, PrintOrderUpdate>;
  getStoriesByOrg(orgId: string): Promise<Story[]>;
  getPostcardStatus(storyId: string): Promise<PrintOrder[]>;
  /** Uses the same lock as every existing collection writer. No provider calls in update. */
  atomicUpdate(
    storyId: string,
    update: (current: Collection) => Collection | Promise<Collection>,
    options?: MutationOptions,
  ): Promise<MutationResult<Story>>;
}

export class DatabaseConflictError extends Error {
  readonly code = "REVISION_CONFLICT";
  constructor() {
    super(
      "Your story changed while this page was open. Reload the latest version and try again.",
    );
  }
}
export class DatabaseConstraintError extends Error {
  readonly code = "DATA_CONSTRAINT";
}
