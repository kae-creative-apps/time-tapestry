import {
  Input,
  BufferSource,
  ALL_FORMATS,
  EncodedPacketSink,
} from "mediabunny";
import { mediaBytes } from "./media";
import type { StoredMedia } from "./types";

const message =
  "This reply recording could not be read. Your message is still here. Play the recording again or record a new reply before sending.";

function assertCompleteWave(bytes: Uint8Array) {
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredEnd = view.getUint32(4, true) + 8;
  if (declaredEnd > bytes.length || declaredEnd < 12) throw new Error(message);
  // The demuxer tolerates an incomplete PCM tail. A submitted reply must have
  // every chunk promised by the finalized file header, including its last one.
  let offset = 12;
  while (offset < declaredEnd) {
    if (offset + 8 > declaredEnd) throw new Error(message);
    const size = view.getUint32(offset + 4, true);
    offset += 8 + size + (size % 2);
    if (offset > declaredEnd) throw new Error(message);
  }
}

/** Inspect actual private bytes, not the uploader's MIME label. No remote URL is passed to the parser. */
export async function validateReplyRecording(media: StoredMedia) {
  let input: Input | undefined;
  try {
    const bytes = await mediaBytes(media);
    assertCompleteWave(bytes);
    input = new Input({
      source: new BufferSource(bytes),
      formats: ALL_FORMATS,
    });
    if (bytes.byteLength !== media.bytes || !(await input.canRead()))
      throw new Error(message);
    const audio = await input.getPrimaryAudioTrack();
    const video = await input.getPrimaryVideoTrack();
    // Audio is required for spoken replies, including camera recordings.
    if (!audio || (media.mimeType.startsWith("video/") && !video))
      throw new Error(message);
    const tracks = video ? [audio, video] : [audio];
    for (const track of tracks) {
      if (!(await track.getCodec())) throw new Error(message);
      const sink = new EncodedPacketSink(track);
      const first = await sink.getFirstPacket({ skipLiveWait: true });
      const last = await sink.getPacket(Infinity, { skipLiveWait: true });
      if (
        !first?.data.byteLength ||
        !last?.data.byteLength ||
        !Number.isFinite(last.timestamp + last.duration) ||
        last.timestamp + last.duration <= first.timestamp
      )
        throw new Error(message);
    }
  } catch {
    throw new Error(message);
  } finally {
    input?.dispose();
  }
}
