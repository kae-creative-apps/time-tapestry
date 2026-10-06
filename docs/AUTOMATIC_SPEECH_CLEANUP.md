# Automatic recorded-speech cleanup

This applies to newly generated original-recording films. It does not replace a person's voice, change saved originals or overwrite approved films.

## Editing policy

- Remove isolated timestamped `um`, `uh` and `erm` variants only when neighboring words leave safe cutting room. Keep quotations, reported examples, hesitation-only replies and ambiguous or overlapping timing.
- Do not automatically remove meaningful uses of “like,” “you know,” “hmm,” repetition or uncertainty. These require understanding the speaker's meaning.
- Shorten long pauses only when ffmpeg confirms a genuinely quiet waveform interval. A gap in a transcript is insufficient evidence. Quiet intervals longer than 1.5 seconds retain about 700 milliseconds of room. Breaths and sound above the detector threshold interrupt a silence interval.
- Preserve whole words and the original order. If evidence is uncertain, leave the passage intact. If cleanup would exceed the bounded automatic clip count, preserve the verified source edit rather than truncating the story.
- Rebuild captions from retained spoken words and their source times. Written companion chapters are never used as replacement sound or caption timing.
- Use one frame interval for picture, sound and captions. Short sample-level audio fades are limited to safe handles and at most 15 milliseconds. Do not overlap adjacent spoken syllables or accelerate the speaker's voice.

## Evidence and approval

The private automatic source plan records retained clips and removed source ranges with reasons. Original files and full transcripts remain available. Template versions distinguish the new policy from older uncleaned jobs. Final approval still binds all four current film hashes.

Automated checks can prove range conservation, caption bounds, exact sample counts and source preservation. They cannot prove emotional naturalness. Before public launch, listen to real audio-only and video interviews, particularly soft speech, emotional pauses, sentence boundaries and noisy microphones. Compare each finished cut with its original. Leave uncertain material intact rather than promise removal of every hesitation.
