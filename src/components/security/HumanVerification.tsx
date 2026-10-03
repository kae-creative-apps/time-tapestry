"use client";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};
let scriptPromise: Promise<Turnstile> | undefined;
function loadTurnstile(): Promise<Turnstile> {
  const current = () =>
    (window as Window & { turnstile?: Turnstile }).turnstile;
  if (current()) return Promise.resolve(current()!);
  if (!scriptPromise)
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () =>
        current()
          ? resolve(current()!)
          : reject(new Error("Verification could not load."));
      script.onerror = () => {
        scriptPromise = undefined;
        script.remove();
        reject(
          new Error(
            "Verification could not load. Check your connection and try again.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return scriptPromise;
}
export function HumanVerification({
  action,
  onToken,
  onReady,
  resetKey = 0,
}: {
  action: string;
  onToken: (token: string) => void;
  onReady: (ready: boolean) => void;
  resetKey?: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Checking this connection…");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false,
      widget: string | undefined,
      api: Turnstile | undefined;
    onReady(false);
    onToken("");
    setFailed(false);
    setMessage("Checking this connection…");
    void (async () => {
      try {
        const response = await fetch("/api/security/config", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Verification is unavailable. Please try again.");
        const config = (await response.json()) as {
          required: boolean;
          configured: boolean;
          siteKey: string;
        };
        if (disposed) return;
        if (!config.required) {
          setMessage("");
          onReady(true);
          return;
        }
        if (!config.configured || !config.siteKey)
          throw new Error(
            "New collections are temporarily unavailable while security setup is completed. Your details are still here.",
          );
        api = await loadTurnstile();
        if (disposed || !element.current) return;
        widget = api.render(element.current, {
          sitekey: config.siteKey,
          action,
          theme: "light",
          callback: (token) => {
            if (!disposed) {
              onToken(token);
              onReady(true);
              setMessage("");
            }
          },
          "expired-callback": () => {
            if (!disposed) {
              onToken("");
              onReady(false);
              setMessage(
                "Please complete verification again before continuing.",
              );
            }
          },
          "error-callback": () => {
            if (!disposed) {
              onToken("");
              onReady(false);
              setFailed(true);
              setMessage("Verification could not finish. Please try again.");
            }
          },
        });
        setMessage("Complete this quick check to continue.");
      } catch (error) {
        if (!disposed) {
          setFailed(true);
          setMessage(
            error instanceof Error
              ? error.message
              : "Verification is unavailable.",
          );
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (widget && api) api.remove(widget);
    };
  }, [action, onToken, onReady, resetKey, retry]);
  return (
    <div className="space-y-2">
      <div ref={element} />
      {message && (
        <p role={failed ? "alert" : "status"} className="text-sm text-ink-500">
          {message}
        </p>
      )}
      {failed && (
        <button
          type="button"
          className="min-h-11 text-sm underline"
          onClick={() => setRetry((value) => value + 1)}
        >
          Try verification again
        </button>
      )}
    </div>
  );
}
