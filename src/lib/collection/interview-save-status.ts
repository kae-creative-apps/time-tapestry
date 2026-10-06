type Recording = {
  state: "recording" | "local" | "backed_up";
  localSaved: boolean;
  empty?: boolean;
  error?: string;
};

/** A session ID or uploaded file alone does not establish a saved interview. */
export function interviewSaveStatus(input: {
  recording: boolean;
  savingRecording: boolean;
  savingWords: boolean;
  pendingWords: number;
  memoryWarning: boolean;
  recordings: Recording[];
  hasSavedAnswers: boolean;
}): string {
  const recordings = input.recordings.filter((record) => !record.empty);
  if (
    input.memoryWarning ||
    recordings.some((record) => record.state === "local" && !record.localSaved)
  )
    return "Not fully saved. Keep this tab open and check the backup below.";
  if (recordings.some((record) => record.error && record.state !== "backed_up"))
    return "A recording still needs backup. Check below before leaving.";
  if (input.recording)
    return recordings.some(
      (record) => record.state === "recording" && record.localSaved,
    )
      ? "Recording · saving on this device"
      : "Recording · first save in progress";
  if (input.savingRecording) return "Backing up your recording";
  if (input.savingWords) return "Backing up your words";
  if (input.pendingWords)
    return "Your words still need backup. Keep this tab open.";
  if (recordings.some((record) => record.state !== "backed_up"))
    return "Your recording is saved on this device. Backup is still needed.";
  return input.hasSavedAnswers ? "Your saved answers are backed up" : "";
}
