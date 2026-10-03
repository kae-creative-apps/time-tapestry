"use client";

import { useEffect, useId, useRef, useState, type SetStateAction } from "react";
import { collectionRequest } from "@/lib/collection/client-request";
import {
  emptyValues,
  formatGenerosityNotes,
  generosityNotesLimits,
  normalizeGenerosityNotesValues,
  type GenerosityNotesValues,
} from "@/lib/collection/generosity-notes";
import type { CollectionView } from "@/lib/collection/types";
import {
  PortalError,
  portalField,
  portalPrimary,
  portalSecondary,
} from "./PortalUI";

type Snapshot = { revision: number; values: GenerosityNotesValues };
const snapshot = (collection: CollectionView): Snapshot => ({
  revision: collection.privateGenerosityNotes?.revision || 0,
  values: collection.privateGenerosityNotes?.values || { ...emptyValues },
});
const sameValues = (a: GenerosityNotesValues, b: GenerosityNotesValues) =>
  (Object.keys(emptyValues) as Array<keyof GenerosityNotesValues>).every(
    (key) => a[key] === b[key],
  );
type NotesState = {
  saved: Snapshot;
  values: GenerosityNotesValues;
  conflict: Snapshot | null;
  saving: boolean;
  checking: boolean;
  notice: string;
  error: string;
  preview: string | null;
};

/** Page-owned memory survives chapter regeneration without browser storage. */
export function useGenerosityNotesEditor() {
  const [state, setState] = useState<NotesState>(() => ({
    saved: { revision: 0, values: { ...emptyValues } },
    values: { ...emptyValues },
    conflict: null,
    saving: false,
    checking: false,
    notice: "",
    error: "",
    preview: null,
  }));
  const requestPending = useRef(false);
  return { state, setState, requestPending };
}
export type GenerosityNotesEditor = ReturnType<typeof useGenerosityNotesEditor>;

const fields = [
  [
    "peopleAndCauses",
    "Who or what mattered to you?",
    "A person, church, ministry, organization or cause.",
  ],
  [
    "involvement",
    "How were you involved?",
    "What did you give, and how often? This might be time, financial support or hospitality.",
  ],
  [
    "years",
    "When was this part of your life?",
    "Approximate years are welcome.",
  ],
  [
    "meaning",
    "What do you want your family to understand?",
    "What drew you to give, what shaped your choices or what you learned.",
  ],
  [
    "impact",
    "What did you see come from it?",
    "Describe what you saw, what someone shared with you or what is still unknown.",
  ],
] as const;

export function GenerosityNotes({
  collection,
  accessKey,
  disabled,
  addDisabled,
  onDirty,
  onSaved,
  onAddToStory,
  editor,
  canAddToStory = true,
}: {
  collection: CollectionView;
  accessKey: string;
  disabled: boolean;
  addDisabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: () => Promise<unknown>;
  /** Returns an explanation if the current story cannot accept the words. */
  onAddToStory?: (text: string) => string | null;
  editor: GenerosityNotesEditor;
  canAddToStory?: boolean;
}) {
  const id = useId();
  const { saved, values, conflict, saving, checking, notice, error, preview } =
    editor.state;
  const { requestPending } = editor;
  const previewInput = useRef<HTMLTextAreaElement>(null);
  function setField<K extends keyof NotesState>(
    key: K,
    next: SetStateAction<NotesState[K]>,
  ) {
    editor.setState((current) => ({
      ...current,
      [key]:
        typeof next === "function"
          ? (next as (previous: NotesState[K]) => NotesState[K])(current[key])
          : next,
    }));
  }
  const dirty = !sameValues(values, saved.values);
  const busy = disabled || saving || checking;
  const collectionEndpoint = `/api/collection/${encodeURIComponent(collection.id)}?key=${encodeURIComponent(accessKey)}`;
  const notesEndpoint = `/api/collection/${encodeURIComponent(collection.id)}/generosity-notes?key=${encodeURIComponent(accessKey)}`;

  function receive(next: Snapshot) {
    editor.setState((current) => {
      if (
        next.revision <=
        Math.max(current.saved.revision, current.conflict?.revision || 0)
      )
        return current;
      if (
        !sameValues(current.values, current.saved.values) &&
        !sameValues(current.values, next.values)
      )
        return { ...current, conflict: next, notice: "" };
      return {
        ...current,
        saved: next,
        values: next.values,
        conflict: null,
        notice: "Your latest private notes are open.",
      };
    });
  }

  useEffect(() => {
    receive(snapshot(collection));
    // Reconcile incoming revisions, preserving any unsaved local notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.privateGenerosityNotes?.revision]);
  useEffect(() => {
    onDirty(
      dirty || saving || checking || preview !== null || Boolean(conflict),
    );
  }, [dirty, saving, checking, preview, conflict, onDirty]);
  useEffect(() => {
    if (preview !== null) previewInput.current?.focus();
  }, [preview !== null]);

  function change(key: keyof GenerosityNotesValues, value: string) {
    setField("values", (current) => ({ ...current, [key]: value }));
    setField("notice", "");
    setField("error", "");
  }

  async function save() {
    if (busy || requestPending.current || conflict || !dirty) return;
    requestPending.current = true;
    setField("saving", true);
    setField("error", "");
    setField("notice", "Saving your private notes…");
    try {
      const result = await collectionRequest<{ collection: CollectionView }>(
        notesEndpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: saved.revision,
            values: normalizeGenerosityNotesValues(values),
          }),
        },
        20000,
      );
      const next = snapshot(result.collection);
      if (next.revision <= saved.revision)
        throw new Error(
          "We could not confirm the save. Check your saved notes before trying again.",
        );
      editor.setState((current) => {
        if (
          next.revision <
          Math.max(current.saved.revision, current.conflict?.revision || 0)
        )
          return {
            ...current,
            notice:
              "Your save completed, but a newer saved copy is available. Compare it with your notes before continuing.",
          };
        return {
          ...current,
          saved: next,
          values: sameValues(current.values, values)
            ? next.values
            : current.values,
          conflict: null,
          notice: "Saved privately. Your story has not changed.",
        };
      });
      await onSaved().catch(() => {});
    } catch (cause) {
      setField("notice", "");
      setField(
        "error",
        `${cause instanceof Error ? cause.message : "Your notes could not be saved."} Your words are still here. Use Check saved notes to review the latest copy.`,
      );
    } finally {
      requestPending.current = false;
      setField("saving", false);
    }
  }

  async function checkSaved() {
    if (busy || requestPending.current) return;
    requestPending.current = true;
    setField("checking", true);
    setField("error", "");
    setField("notice", "Checking your saved notes…");
    try {
      const result = await collectionRequest<{ collection: CollectionView }>(
        collectionEndpoint,
      );
      const next = snapshot(result.collection);
      receive(next);
      if (next.revision === saved.revision)
        setField(
          "notice",
          "The saved copy has not changed. Your unsaved words are still here; try Save privately again when you are ready.",
        );
    } catch (cause) {
      setField(
        "error",
        cause instanceof Error
          ? cause.message
          : "We could not check your saved notes. Your words are still here.",
      );
    } finally {
      requestPending.current = false;
      setField("checking", false);
    }
  }

  function chooseVersion(useSaved: boolean) {
    if (!conflict) return;
    setField("saved", conflict);
    if (useSaved) setField("values", conflict.values);
    setField("conflict", null);
    setField("preview", null);
    setField("error", "");
    setField(
      "notice",
      useSaved
        ? "The saved notes are open."
        : "Your words are still open. Review them, then Save privately to replace the saved copy.",
    );
  }

  function addWords() {
    const words = preview?.trim();
    if (
      !words ||
      !canAddToStory ||
      !onAddToStory ||
      busy ||
      addDisabled ||
      dirty ||
      conflict
    )
      return;
    const problem = onAddToStory(words);
    if (problem) {
      setField("error", problem);
      return;
    }
    setField("preview", null);
    setField("error", "");
    setField(
      "notice",
      "Your chosen words are in the story draft. Save the story changes, then review and approve what you want to share.",
    );
  }

  return (
    <details className="mt-6 rounded-2xl border border-sage-200 bg-sage-50 p-5 text-espresso sm:p-7">
      <summary className="min-h-12 cursor-pointer text-lg font-semibold">
        Where you sowed{" "}
        <span className="ml-2 text-sm font-normal text-ink-500">
          Optional private notes
        </span>
      </summary>
      <div className="max-w-3xl">
        <h3 className="mt-3 text-2xl font-semibold">
          Anything you’d rather write down?
        </h3>
        <p className="mt-3 text-base leading-7 text-ink-600">
          A few details can help your family understand what mattered to you.
          You decide which memories and details to keep. Every field is
          optional.
        </p>
        <p className="mt-3 text-sm leading-7 text-ink-500">
          These notes stay in your private workspace. They are not used to
          prepare stories or films, and never go automatically onto postcards.
          {canAddToStory
            ? " You can choose words for your story below."
            : " Your approved stories stay unchanged. You can keep updating these private notes."}
        </p>
        {conflict && (
          <section
            className="mt-5 rounded-xl border border-clay-300 bg-white p-4"
            aria-label="Compare private notes"
          >
            <h4 className="font-semibold">
              Your saved notes changed in another session.
            </h4>
            <p className="mt-2 text-base leading-7">
              Your unsaved words are still in the fields below. Read the saved
              copy before choosing which notes to continue with.
            </p>
            <details className="mt-3">
              <summary className="min-h-12 cursor-pointer font-medium">
                Read the latest saved notes
              </summary>
              <p className="whitespace-pre-wrap text-base leading-7">
                {formatGenerosityNotes(conflict.values) ||
                  "The saved notes are empty."}
              </p>
            </details>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                className={portalSecondary}
                disabled={busy}
                onClick={() => chooseVersion(true)}
              >
                Use saved notes
              </button>
              <button
                type="button"
                className={portalSecondary}
                disabled={busy}
                onClick={() => chooseVersion(false)}
              >
                Continue with my notes
              </button>
            </div>
          </section>
        )}
        <fieldset
          disabled={busy || (canAddToStory && preview !== null)}
          className="mt-6 space-y-5"
        >
          <legend className="sr-only">Optional private giving memories</legend>
          {fields.map(([key, label, help]) => (
            <div key={key}>
              <label
                htmlFor={`${id}-${key}`}
                className="block text-base font-medium"
              >
                {label}{" "}
                <span className="font-normal text-ink-500">(optional)</span>
              </label>
              <p
                id={`${id}-${key}-help`}
                className="mt-1 text-sm leading-6 text-ink-500"
              >
                {help}
              </p>
              <textarea
                id={`${id}-${key}`}
                aria-describedby={`${id}-${key}-help`}
                rows={key === "years" ? 2 : 3}
                maxLength={generosityNotesLimits[key]}
                className={portalField}
                value={values[key]}
                onChange={(event) => change(key, event.target.value)}
              />
            </div>
          ))}
          <details className="rounded-xl border border-sage-200 bg-white/60 p-4">
            <summary className="min-h-12 cursor-pointer text-base font-medium">
              An amount or range, if you want to include it
            </summary>
            <label
              htmlFor={`${id}-amount`}
              className="mt-2 block text-base font-medium"
            >
              Amount or range (optional)
            </label>
            <p
              id={`${id}-amount-help`}
              className="mt-1 text-sm leading-6 text-ink-500"
            >
              You can leave this blank. If you add a figure, say whether it was
              one gift, regular giving or an estimate over time. Include the
              currency and anything you are unsure of, or whether you checked a
              record.
            </p>
            <textarea
              id={`${id}-amount`}
              aria-describedby={`${id}-amount-help`}
              rows={3}
              maxLength={generosityNotesLimits.amount}
              className={portalField}
              value={values.amount}
              onChange={(event) => change("amount", event.target.value)}
            />
          </details>
        </fieldset>
        <p className="mt-4 text-sm leading-6 text-ink-500">
          Save before leaving this page. Unsaved private notes are kept only
          while this page is open.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={portalPrimary}
            disabled={busy || !dirty || Boolean(conflict)}
            onClick={() => void save()}
          >
            {saving ? "Saving privately…" : "Save privately"}
          </button>
          {error && (
            <button
              type="button"
              className={portalSecondary}
              disabled={busy}
              onClick={() => void checkSaved()}
            >
              {checking ? "Checking saved notes…" : "Check saved notes"}
            </button>
          )}
          {canAddToStory &&
            saved.revision > 0 &&
            formatGenerosityNotes(saved.values) &&
            preview === null && (
              <button
                type="button"
                className={portalSecondary}
                disabled={busy || dirty || Boolean(conflict)}
                onClick={() => {
                  setField("preview", formatGenerosityNotes(saved.values));
                  setField("notice", "");
                  setField("error", "");
                }}
              >
                Choose words for my story
              </button>
            )}
        </div>
        {canAddToStory && preview !== null && (
          <section
            className="mt-6 rounded-xl border border-sage-200 bg-white p-4 sm:p-5"
            aria-label="Choose words for your story"
          >
            <label
              htmlFor={`${id}-preview`}
              className="block text-lg font-semibold"
            >
              Choose the words you want in your story
            </label>
            <p
              id={`${id}-preview-help`}
              className="mt-2 text-base leading-7 text-ink-600"
            >
              Edit or remove anything below, including names or amounts. These
              words will be added to your written story draft. Original
              recordings stay unchanged. Save, review and approve the story
              before sharing it.
            </p>
            <textarea
              ref={previewInput}
              id={`${id}-preview`}
              aria-describedby={`${id}-preview-help`}
              rows={10}
              maxLength={100000}
              className={portalField}
              value={preview}
              disabled={busy || addDisabled}
              onChange={(event) => {
                setField("preview", event.target.value);
                setField("error", "");
              }}
            />
            <p className="mt-3 text-sm leading-7 text-ink-500">
              This preview is a copy of the notes you opened. Editing your
              private notes later will not change words already copied into a
              story. Postcards use separately approved public wording.
            </p>
            {addDisabled && (
              <p className="mt-3 text-sm leading-7 text-ink-500">
                Finish the current story recovery, save or film preparation
                before adding words.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={portalPrimary}
                disabled={
                  busy ||
                  addDisabled ||
                  dirty ||
                  Boolean(conflict) ||
                  !preview.trim()
                }
                onClick={addWords}
              >
                Add these words to my story draft
              </button>
              <button
                type="button"
                className={portalSecondary}
                disabled={busy}
                onClick={() => setField("preview", null)}
              >
                Keep notes private
              </button>
            </div>
          </section>
        )}
        {!canAddToStory && preview !== null && (
          <section className="mt-6 rounded-xl border border-sage-200 bg-white p-4">
            <p className="text-base leading-7">
              Your collection was approved while these words were open. They
              have not been added to your approved stories.
            </p>
            <details className="mt-3">
              <summary className="min-h-12 cursor-pointer font-medium">
                Read the words you were choosing
              </summary>
              <p className="whitespace-pre-wrap text-base leading-7">
                {preview}
              </p>
            </details>
            <button
              type="button"
              className={`${portalSecondary} mt-3`}
              onClick={() => setField("preview", null)}
            >
              Close this preview
            </button>
          </section>
        )}
        <PortalError message={error} />
        <p
          role="status"
          aria-live="polite"
          className="mt-4 text-base leading-7 text-sage-700"
        >
          {notice || (dirty ? "Private notes have unsaved changes." : "")}
        </p>
      </div>
    </details>
  );
}
