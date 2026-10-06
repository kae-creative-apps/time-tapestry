/** Check decoding through the same authenticated media endpoint used for playback. */
export function verifyReplyPlayback(src: string, timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    const media = document.createElement("video");
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      media.removeEventListener("canplay", ready);
      media.removeEventListener("error", failed);
      media.removeAttribute("src");
      media.load();
      if (error) reject(error);
      else resolve();
    };
    const ready = () => finish();
    const failed = () =>
      finish(
        new Error(
          "Your recording could not be played. Your reply is still saved here. Check the recording before sending again.",
        ),
      );
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Your recording is taking too long to open. Your reply is still here. Check your connection and try again.",
          ),
        ),
      timeoutMs,
    );
    media.addEventListener("canplay", ready);
    media.addEventListener("error", failed);
    media.preload = "auto";
    media.src = src;
    media.load();
  });
}
