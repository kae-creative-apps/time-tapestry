"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/icons";
import { SiriOrb } from "@/components/ui/siri-orb";
import { BrandArtwork } from "@/components/BrandArtwork";
import type { StoryPlaybackArtifact } from "@/lib/audio/playback-types";
import {
  playbackClock,
  playbackPhrases,
  phraseAtTime,
} from "./story-playback-captions";
import styles from "./StoryFilmPlayer.module.css";

type SafariWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Plays only the authorized chapter derivative. The visualizer never produces audio. */
export function StoryFilmPlayer({
  src,
  title,
  storytellerName,
  playback,
  active = true,
  preload = "metadata",
  onEnded,
  downloadUrl,
  seekToMs = null,
  seekToken = 0,
}: {
  src: string;
  title: string;
  storytellerName?: string;
  playback: StoryPlaybackArtifact;
  active?: boolean;
  preload?: "none" | "metadata";
  onEnded?: () => void;
  downloadUrl?: string;
  seekToMs?: number | null;
  seekToken?: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const orb = useRef<HTMLDivElement>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const mounted = useRef(true);
  const unlockPending = useRef(false);
  const analysisUnavailable = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(playback.durationMs / 1000);
  const [error, setError] = useState("");
  const [nativeControls, setNativeControls] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [audioRevision, setAudioRevision] = useState(0);
  const sliderId = useId();
  const phrases = useMemo(
    () => playbackPhrases(playback.words),
    [playback.words],
  );
  const phrase = phraseAtTime(phrases, position * 1000);
  const transcript = useMemo(
    () =>
      playback.words
        .map((word) => word.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1"),
    [playback.words],
  );

  useEffect(() => {
    mounted.current = true;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => {
      mounted.current = false;
      preference.removeEventListener("change", update);
      source.current?.disconnect();
      analyser.current?.disconnect();
      void context.current?.close().catch(() => {});
      context.current = null;
      source.current = null;
      analyser.current = null;
    };
  }, []);

  useEffect(() => {
    // The native fallback can replace the element. Capture each actual element
    // so removing a chapter always stops its sound, even after a graph failure.
    const player = audio.current;
    return () => {
      player?.pause();
      source.current?.disconnect();
      analyser.current?.disconnect();
      source.current = null;
      analyser.current = null;
    };
  }, [src, audioRevision]);

  useEffect(() => {
    if (!active) audio.current?.pause();
  }, [active]);
  useEffect(() => {
    if (seekToMs == null || !seekToken) return;
    const player = audio.current;
    if (!player) return;
    const seconds = seekToMs / 1000;
    const move = () => {
      player.currentTime = seconds;
    };
    player.addEventListener("loadedmetadata", move);
    if (player.readyState >= 1) move();
    void player.play().catch(() => {});
    return () => player.removeEventListener("loadedmetadata", move);
  }, [seekToken, seekToMs]);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!playing || !active) {
      orb.current?.style.setProperty("--voice-level", "0");
      return;
    }
    let frame = 0,
      lastTime = 0;
    const samples = new Uint8Array(256);
    const tick = (now: number) => {
      if (now - lastTime > 65) {
        const media = audio.current;
        if (media) setPosition(media.currentTime);
        if (analyser.current && !reducedMotion) {
          analyser.current.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
          orb.current?.style.setProperty("--voice-level", String(level));
        }
        lastTime = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, active, reducedMotion]);

  // Create and resume inside the tap, before the first await. Native playback is
  // started in that same gesture. Attach the graph only once resume succeeds,
  // so a denied AudioContext leaves the ordinary audio element untouched.
  function unlockVisualization(player: HTMLAudioElement) {
    if (analysisUnavailable.current || unlockPending.current) return;
    try {
      const Context =
        window.AudioContext || (window as SafariWindow).webkitAudioContext;
      if (!Context) {
        analysisUnavailable.current = true;
        return;
      }
      const graph = context.current || new Context();
      context.current = graph;
      unlockPending.current = true;
      const resume =
        graph.state === "running" ? Promise.resolve() : graph.resume();
      void resume
        .then(() => {
          if (
            !mounted.current ||
            audio.current !== player ||
            graph.state !== "running"
          )
            return;
          if (source.current) return;
          // Build the optional analysis node first. Any failure here preserves
          // native playback, because no media-element source has been created.
          const meter = graph.createAnalyser();
          meter.fftSize = 256;
          meter.smoothingTimeConstant = 0.75;
          const node = graph.createMediaElementSource(player);
          source.current = node;
          try {
            node.connect(graph.destination);
          } catch {
            // A failed output connection cannot be undone on this element. Give
            // the user a fresh, native element that has never entered the graph.
            player.pause();
            analysisUnavailable.current = true;
            setNativeControls(true);
            setAudioRevision((value) => value + 1);
            setError("Use Play to continue with the standard audio player.");
            return;
          }
          try {
            node.connect(meter);
            analyser.current = meter;
          } catch {
            analysisUnavailable.current = true;
          }
        })
        .catch(() => {
          analysisUnavailable.current = true;
          if (mounted.current) setNativeControls(true);
        })
        .finally(() => {
          unlockPending.current = false;
        });
    } catch {
      analysisUnavailable.current = true;
      setNativeControls(true);
    }
  }

  async function play(retry = false) {
    const player = audio.current;
    if (!player || !active) return;
    if (playing) {
      player.pause();
      return;
    }
    setError("");
    setLoading(true);
    if (retry) player.load();
    unlockVisualization(player);
    const request = player.play();
    try {
      await request;
    } catch (cause) {
      if (!mounted.current || audio.current !== player) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setLoading(false);
      setPlaying(false);
      setNativeControls(true);
      setError(
        "This story could not play. Check your connection, then try Play again.",
      );
    }
  }
  function seek(value: number) {
    const player = audio.current;
    if (!player) return;
    const next = Math.min(duration, Math.max(0, value));
    try {
      player.currentTime = next;
      setPosition(next);
    } catch {
      /* Metadata may still be arriving. */
    }
  }
  function loaded() {
    const value = audio.current?.duration;
    if (value && Number.isFinite(value)) setDuration(value);
  }

  return (
    <section className={styles.player} aria-label={`Story film: ${title}`}>
      <div className={styles.stage}>
        <div className={styles.stageHeader}>
          <span>
            In {storytellerName ? `${storytellerName}’s` : "your"} own voice
          </span>
          <BrandArtwork variant="mark" className={styles.mark} />
        </div>
        <div ref={orb} className={styles.orb} aria-hidden="true">
          <SiriOrb size="150px" />
        </div>
        <div className={styles.captions} aria-hidden="true">
          {phrase ? (
            <p>
              {phrase.words.map((word, index) => (
                <span
                  key={`${word.startMs}:${index}`}
                  className={
                    position * 1000 >= word.startMs &&
                    position * 1000 < word.endMs
                      ? styles.currentWord
                      : undefined
                  }
                >
                  {word.text}{" "}
                </span>
              ))}
            </p>
          ) : (
            <p>{title}</p>
          )}
        </div>
        <p className={styles.stageNote}>{title}</p>
      </div>
      <div className={styles.controls}>
        <div className={styles.mainControls}>
          <button
            type="button"
            className={styles.playButton}
            aria-label={`${playing ? "Pause" : "Play"}: ${title}`}
            disabled={!active}
            onClick={() => void play(Boolean(error))}
          >
            <AppIcon name={playing ? "pause" : "play"} size={22} />
            {playing ? "Pause story" : "Play story"}
          </button>
          <div className={styles.skipControls}>
            <button
              type="button"
              onClick={() => seek(position - 15)}
              aria-label="Back 15 seconds"
            >
              −15 sec
            </button>
            <button
              type="button"
              onClick={() => seek(position + 15)}
              aria-label="Forward 15 seconds"
            >
              +15 sec
            </button>
          </div>
        </div>
        <label htmlFor={sliderId} className="sr-only">
          Position in {title}
        </label>
        <input
          id={sliderId}
          type="range"
          className={styles.seek}
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(position, Math.max(duration, 1))}
          aria-valuetext={`${playbackClock(position)} of ${playbackClock(duration)}`}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <div className={styles.time}>
          <span>{playbackClock(position)}</span>
          <span>{playbackClock(duration)}</span>
        </div>
        <p className={styles.status} role="status">
          {loading
            ? slow
              ? "This is taking longer than usual. Your story is still saved."
              : "Opening your story…"
            : ""}
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <details
          className={styles.native}
          open={nativeControls}
          onToggle={(event) => setNativeControls(event.currentTarget.open)}
        >
          <summary>Standard audio controls</summary>
          <audio
            key={`${src}:${audioRevision}`}
            ref={audio}
            src={src}
            controls
            preload={active ? preload : "none"}
            aria-label={title}
            onLoadedMetadata={loaded}
            onDurationChange={loaded}
            onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)}
            onPlay={() => {
              if (!active) {
                audio.current?.pause();
                return;
              }
              // Native controls may be used after Safari suspended an existing graph.
              if (context.current && context.current.state !== "running")
                void context.current.resume().catch(() => {});
              setPlaying(true);
            }}
            onPlaying={() => {
              setPlaying(true);
              setLoading(false);
              setError("");
            }}
            onWaiting={() => setLoading(true)}
            onPause={() => {
              setPlaying(false);
              setLoading(false);
            }}
            onEnded={() => {
              setPlaying(false);
              setLoading(false);
              onEnded?.();
            }}
            onError={() => {
              setPlaying(false);
              setLoading(false);
              setNativeControls(true);
              setError(
                "This story could not load. Check your connection, then try Play again.",
              );
            }}
          />
        </details>
        <details className={styles.transcript}>
          <summary>Read the spoken words</summary>
          <p>
            {transcript ||
              "The spoken transcript is not available for this chapter yet."}
          </p>
        </details>
        {downloadUrl && (
          <a className={styles.download} href={downloadUrl} download>
            <AppIcon name="download" size={18} /> Download this film (MP4)
          </a>
        )}
      </div>
    </section>
  );
}
