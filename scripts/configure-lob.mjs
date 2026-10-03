#!/usr/bin/env node
import { constants } from "node:fs";
import { open, lstat, rename, unlink, link } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function validateKey(key) {
  if (!/^(test|live)_[A-Za-z0-9]{16,128}$/.test(key)) {
    throw new Error("Use a Lob API key beginning with test_ or live_. The key was not saved.");
  }
}

/** Change only this variable, retaining every other byte and line ending. */
export function updateLobEnv(contents, key) {
  validateKey(key);
  const lines = contents.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
  const updated = [];
  let found = false;
  for (let index = 0; index < lines.length; index++) {
    let block = lines[index];
    const assignment = /^([\t ]*(?:export[\t ]+)?)([\w.-]+)([\t ]*=[\t ]*)([^\r\n]*)/.exec(block);
    if (assignment) {
      const quote = assignment[4][0];
      if (["'", '"', "`"].includes(quote)) {
        let value = assignment[4];
        let closed = false;
        for (let cursor = 1; ; cursor++) {
          if (cursor >= value.length) {
            if (index + 1 >= lines.length) break;
            const next = lines[++index];
            block += next;
            value += `\n${next}`;
          }
          if (value[cursor] === "\\") { cursor++; continue; }
          if (value[cursor] === quote) { closed = true; break; }
        }
        if (!closed) throw new Error("The environment file has an unfinished quoted value. Nothing was saved.");
      }
      if (assignment[2] === "LOB_API_KEY") {
        found = true;
        block = assignment[1] + assignment[2] + assignment[3] + key + (block.match(/\r?\n$/)?.[0] ?? "");
      }
    }
    updated.push(block);
  }
  if (found) return updated.join("");
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  return contents + (contents && !contents.endsWith("\n") ? newline : "") +
    `LOB_API_KEY=${key}${newline}`;
}

async function snapshot(file) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error("The environment path must be a regular file.");
    const contents = await handle.readFile("utf8");
    const after = await handle.stat({ bigint: true });
    if (!sameStat(before, after)) throw new Error("The environment file changed. Run this helper again.");
    return { stat: after, contents };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error.code === "ELOOP") throw new Error("Refusing a symbolic-link environment file.");
    throw error;
  } finally {
    await handle?.close();
  }
}

function sameStat(a, b) {
  return ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((field) => a[field] === b[field]);
}

async function assertUnchanged(file, previous) {
  const current = await snapshot(file);
  if ((!previous !== !current) || (previous &&
      (!sameStat(previous.stat, current.stat) || previous.contents !== current.contents))) {
    throw new Error("The environment file changed while you entered the key. Nothing was saved. Run this helper again.");
  }
  if (current && (await lstat(file)).isSymbolicLink()) {
    throw new Error("Refusing a symbolic-link environment file.");
  }
}

async function saveKey(file, previous, key) {
  const contents = updateLobEnv(previous?.contents ?? "", key);
  // Matches the repository's .env*.local ignore rule, including during the write.
  const temporary = path.join(path.dirname(file), `.env.lob-${randomUUID()}.local`);
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.chmod(0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertUnchanged(file, previous);
    if (previous) {
      await rename(temporary, file);
    } else {
      // Publish a new file atomically without replacing a concurrent creation.
      await link(temporary, file);
    }
  } finally {
    await handle?.close();
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function readHiddenKey() {
  const input = process.stdin;
  const wasRaw = Boolean(input.isRaw);
  let value = "";
  let onData, onEnd, onError, onInterrupt, onTerminate;
  process.stdout.write("Paste your Lob API key, then press Return (input is hidden): ");
  try {
    input.setRawMode(true);
    return await new Promise((resolve, reject) => {
      onInterrupt = () => reject(new Error("Cancelled. Nothing was saved."));
      onTerminate = onInterrupt;
      onEnd = () => reject(new Error("Input ended. Nothing was saved."));
      onError = () => reject(new Error("Could not read terminal input. Nothing was saved."));
      onData = (chunk) => {
        for (const char of chunk.toString("utf8")) {
          if (char === "\u0003" || char === "\u0004" || char === "\u001a") return onInterrupt();
          if (char === "\r" || char === "\n") return resolve(value.trim());
          if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
          else if (char >= " " && char !== "\u007f") value += char;
          else return reject(new Error("Unexpected terminal input. Nothing was saved."));
          if (value.length > 256) return reject(new Error("The input is too long. Nothing was saved."));
        }
      };
      input.on("data", onData);
      input.once("end", onEnd);
      input.once("error", onError);
      process.once("SIGINT", onInterrupt);
      process.once("SIGTERM", onTerminate);
      input.resume();
    });
  } finally {
    if (onData) input.off("data", onData);
    if (onEnd) input.off("end", onEnd);
    if (onError) input.off("error", onError);
    if (onInterrupt) process.off("SIGINT", onInterrupt);
    if (onTerminate) process.off("SIGTERM", onTerminate);
    input.setRawMode(wasRaw);
    input.pause();
    value = "";
    process.stdout.write("\n");
  }
}

export const LOB_SETUP_LIFETIME_MS = 4 * 60 * 60_000;

/** Start a localhost-only setup session. The options support deterministic lifecycle tests. */
export async function startLobBrowserSetup(file, allowLive = false, {
  lifetimeMs = LOB_SETUP_LIFETIME_MS,
  now = Date.now,
  scheduleExpiry = setTimeout,
} = {}) {
  const previous = await snapshot(file);
  const expiresAt = new Date(now() + lifetimeMs);
  const expiryLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "long",
  }).format(expiresAt);
  const route = `/setup/${randomUUID()}`;
  const csrf = randomUUID();
  const nonce = randomUUID();
  let origin = "";
  let busy = false;
  let completed = false;
  let confirmation = "";
  const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Lob locally</title><style nonce="${nonce}">body{font:18px system-ui;max-width:520px;margin:10vh auto;padding:24px;line-height:1.5;color:#211c18;background:#faf8f5}input,button{font:inherit;box-sizing:border-box;width:100%;padding:12px;margin-top:12px}button{cursor:pointer}small{display:block;margin-top:18px}</style><h1>Connect Lob locally</h1>${body}</html>`;
  const form = page(`<p>Paste your Lob ${allowLive ? "" : "test "}API key below. This form saves it only in this project's local environment file.</p><form method="post" action="${route}" autocomplete="off"><input type="hidden" name="csrf" value="${csrf}"><label for="key">Lob ${allowLive ? "" : "test "}API key</label><input id="key" name="key" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="none" maxlength="256" required autofocus><button type="submit">Save API key</button></form><small>${allowLive ? "" : "This setup accepts test_ keys only. "}Delivery settings stay unchanged. Saving a key does not send postcards or contact Lob.</small><small>This local form stays open until <time datetime="${expiresAt.toISOString()}">${expiryLabel}</time>, unless this helper or computer is stopped. If it expires, reopen the helper to get a new link.</small>`);
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
    // Keep the origin available to native form POSTs without sharing the private path.
    response.setHeader("Referrer-Policy", "strict-origin");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const reply = (status, text) => { response.writeHead(status); response.end(text); };
    if (request.headers.host !== origin.slice("http://".length) || request.url !== route) return reply(404, "Not found.");
    if (request.method === "GET") return reply(200, completed ? confirmation : form);
    if (request.method !== "POST") return reply(405, "Method not allowed.");
    if (!request.headers.origin || request.headers.origin === "null") return reply(403, page(`<p>Your browser did not identify this local setup page when submitting. Nothing was saved.</p><p>Reopen the setup link in a regular browser tab and try again.</p><a href="${route}">Return to setup</a>`));
    if (request.headers.origin !== origin) return reply(403, page("<p>This submission did not come from the local setup page. Nothing was saved. Reopen the original setup link and try again.</p>"));
    if (completed) {
      request.resume();
      response.setHeader("Location", route);
      return reply(303, "Key already saved. Return to the confirmation page.");
    }
    if (busy) return reply(409, page("<p>Your key is being saved. Wait a moment, then reload this page.</p>"));
    const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") return reply(415, page(`<p>The browser sent an unsupported form format. Nothing was saved.</p><a href="${route}">Return to setup</a>`));
    let bytes = 0;
    const chunks = [];
    let ownsWrite = false;
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 4096) { reply(413, "Input too large. Nothing was saved."); return; }
        chunks.push(chunk);
      }
      if (busy || completed) return reply(409, "This form has already been used or is saving.");
      const fields = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      if (fields.getAll("csrf").length !== 1 || fields.get("csrf") !== csrf || fields.getAll("key").length !== 1) return reply(403, page(`<p>This setup session could not be verified. Nothing was saved.</p><p>Reopen the setup form and paste the test key again.</p><a href="${route}">Return to setup</a>`));
      const key = fields.get("key").trim();
      try { validateKey(key); } catch {
        return reply(400, page(`<p>Use a Lob API key beginning with test_ or live_. Nothing was saved.</p><a href="${route}">Try again</a>`));
      }
      if (!allowLive && !key.startsWith("test_")) return reply(400, page(`<p>This setup accepts test_ keys only. The live key was not saved.</p><a href="${route}">Try again</a>`));
      busy = true;
      ownsWrite = true;
      await saveKey(file, previous, key);
      completed = true;
      confirmation = page(`<p>Your Lob ${key.startsWith("test_") ? "test" : "live"} key is saved with owner-only file permissions.</p><p>Delivery settings are unchanged. No provider request was sent. Restart the local preview to load the key.</p><p>You can close this tab. This confirmation remains available until <time datetime="${expiresAt.toISOString()}">${expiryLabel}</time>.</p>`);
      response.setHeader("Location", route);
      reply(303, "Key saved. Return to the confirmation page.");
    } catch {
      if (!response.headersSent) reply(400, page("<p>The key could not be saved safely. Restart the setup helper and try again.</p>"));
    } finally {
      if (ownsWrite) busy = false;
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  const expiry = scheduleExpiry(() => { server.close(); server.closeAllConnections(); }, lifetimeMs);
  expiry.unref?.();
  server.once("close", () => clearTimeout(expiry));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: `${origin}${route}`, expiresAt, expiryLabel };
}

async function main() {
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some((arg) => !["--browser", "--allow-live"].includes(arg))) throw new Error("Use --browser for a local form. Never pass the key as an argument.");
  const browser = args.includes("--browser");
  const allowLive = args.includes("--allow-live");
  const file = fileURLToPath(new URL("../.env.local", import.meta.url));
  if (browser) {
    const setup = await startLobBrowserSetup(file, allowLive);
    process.stdout.write(`${setup.url}\nLocal setup remains available until ${setup.expiryLabel}. Keep this helper running.\n`);
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Open this helper in an interactive terminal. Piped input is refused.");
  }
  const previous = await snapshot(file);
  const key = await readHiddenKey();
  validateKey(key);
  if (!allowLive && !key.startsWith("test_")) throw new Error("This setup accepts test_ keys only. The live key was not saved.");
  await saveKey(file, previous, key);
  process.stdout.write(`Saved the Lob ${key.startsWith("test_") ? "test" : "live"} key in .env.local with owner-only permissions.\nDelivery settings are unchanged. No provider request was sent. Restart the local preview to load the key.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Filesystem diagnostics can contain private paths. Only our fixed messages are safe.
    const message = error.code ? "Could not safely save the key. Check the environment file and try again." : error.message;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
