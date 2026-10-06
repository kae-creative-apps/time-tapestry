export type RecordingUploadProgress = {
  stage: "uploading" | "confirming";
  loadedBytes?: number;
  totalBytes?: number;
};

type Recording = {
  id: string;
  state: "recording" | "local" | "backed_up";
  empty?: boolean;
  error?: string;
  uploadProgress?: RecordingUploadProgress;
};

export type RecordingBackupPart = {
  id: string;
  number: number;
  stage:
    | "recording"
    | "waiting"
    | "uploading"
    | "confirming"
    | "failed"
    | "backed_up";
  percentage?: number;
};

export type RecordingBackupProgressState = {
  parts: RecordingBackupPart[];
  confirmedParts: number;
  totalParts: number;
  complete: boolean;
  recording: boolean;
  finalizing: boolean;
};

/** Use transport byte events only. A finished transfer still needs server acknowledgement. */
export function recordingUploadProgress(
  loaded: number,
  total: number,
): RecordingUploadProgress {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0)
    return { stage: "uploading" };
  const loadedBytes = Math.max(0, Math.min(loaded, total));
  return {
    stage: loadedBytes === total ? "confirming" : "uploading",
    loadedBytes,
    totalBytes: total,
  };
}

/** Parts are counted equally and labelled as parts, never presented as a byte estimate. */
export function recordingBackupProgress(
  recordings: Recording[],
  options: { recording: boolean; saving: boolean },
): RecordingBackupProgressState {
  const parts = recordings
    .filter((part) => !part.empty)
    .map((part, index): RecordingBackupPart => {
      const common = { id: part.id, number: index + 1 };
      if (part.state === "backed_up") return { ...common, stage: "backed_up" };
      if (part.error) return { ...common, stage: "failed" };
      if (part.state === "recording") return { ...common, stage: "recording" };
      if (!part.uploadProgress) return { ...common, stage: "waiting" };
      const { stage, loadedBytes, totalBytes } = part.uploadProgress;
      const measured =
        loadedBytes !== undefined && totalBytes !== undefined
          ? recordingUploadProgress(loadedBytes, totalBytes)
          : undefined;
      if (stage === "confirming" || measured?.stage === "confirming")
        return { ...common, stage: "confirming" };
      return {
        ...common,
        stage: "uploading",
        percentage: measured?.totalBytes
          ? Math.min(
              99,
              Math.floor((measured.loadedBytes! / measured.totalBytes) * 100),
            )
          : undefined,
      };
    });
  const confirmedParts = parts.filter(
    (part) => part.stage === "backed_up",
  ).length;
  return {
    parts,
    confirmedParts,
    totalParts: parts.length,
    complete:
      parts.length > 0 &&
      confirmedParts === parts.length &&
      !options.recording &&
      !options.saving,
    recording: options.recording,
    finalizing: options.saving && confirmedParts === parts.length,
  };
}
