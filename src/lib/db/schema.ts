import type {
  AdditionalRecipient,
  AnswerTake,
  ChapterPackage,
  Collection,
  Delivery,
} from "../collection/types";

export type Revision = string;
export type Story = {
  id: string;
  user_id: string | null;
  org_id: string | null;
  title: string;
  status: Collection["status"];
  created_at: string;
  updated_at: string;
  trace_id: string;
  revision: Revision;
};
/** Chapter IDs are scoped to a story. q1 is not globally unique. */
export type Chapter = {
  id: string;
  story_id: string;
  theme_index: number;
  title: string;
  audio_url: string | null;
  transcript_json: { text: string; source_take_ids: string[] };
  status: ChapterPackage["videoStatus"];
};
export type Take = {
  id: string;
  story_id: string;
  chapter_id: string;
  question_id: string;
  take_number: number;
  audio_blob_url: string | null;
  audio_media_id: string | null;
  duration: number | null;
  is_selected: boolean;
};
export type Recipient = {
  id: string;
  story_id: string;
  name: string;
  email: string;
  street_address: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  kind: "postal_primary" | "digital";
};
export type PrintOrder = {
  id: string;
  story_id: string;
  chapter_id: string;
  recipient_id: string;
  lob_job_id: string | null;
  status: Delivery["status"];
  /** Legacy storage records the latest event, not a complete event timeline. */
  tracking_events: Array<{ type: string; occurred_at: string | null }>;
  expected_delivery: string | null;
  scheduled_for: string;
};
export type StoryMetadata = {
  userId?: string;
  orgId?: string;
  title?: string;
  deletedAt?: string;
};
export type StoredStory = Collection & { database?: StoryMetadata };
export type StoryCreate = {
  collection: Collection;
  metadata?: Omit<StoryMetadata, "deletedAt">;
};
export type StoryUpdate = Partial<Pick<Story, "user_id" | "org_id" | "title">>;
export type ChapterCreate = { chapter: ChapterPackage };
export type ChapterUpdate = Partial<
  Pick<ChapterPackage, "title" | "content" | "postcardNote">
>;
/** Media must already have been uploaded and validated by the calling service. */
export type TakeCreate = { take: AnswerTake; select?: boolean };
export type TakeUpdate = { is_selected: boolean };
/** Extra recipients are digital only. Physical deliveries belong to the primary recipient. */
export type RecipientCreate = { recipient: AdditionalRecipient };
export type RecipientUpdate = Partial<
  Pick<Recipient, "name" | "email" | "phone">
>;
export type PrintOrderCreate = { delivery: Delivery };
export type PrintOrderUpdate = Partial<Pick<Delivery, "scheduledFor">>;
