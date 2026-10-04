import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A rehearsal uses durable local storage, never a temporary directory or cloud copy.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3109);
const dist = process.env.NEXT_DIST_DIR || ".next";
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^\.next(?:-[a-zA-Z0-9-]+)?$/.test(dist)) {
  throw new Error("Choose a valid local port and .next build directory.");
}
if (!existsSync(path.join(root, dist, "BUILD_ID"))) {
  throw new Error("Build the app first with the same NEXT_DIST_DIR, then start the preview.");
}
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: dist,
    COLLECTION_DATA_DIR: path.join(root, ".data", "collections"),
    KV_REST_API_URL: "",
    KV_REST_API_TOKEN: "",
    BLOB_READ_WRITE_TOKEN: "",
    COLLECTION_EMAIL_ENABLED: "false",
    COLLECTION_DELIVERY_ENABLED: "false",
    // The server binds only to loopback. Hosted human-verification setup is not
    // available here; application auth, rate limits and quotas still apply.
    SECURITY_LOCAL_BYPASS: "true",
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
  },
});
console.log(`Local rehearsal: http://localhost:${port}. Data stays in the project's private .data/collections folder. Email and postcard sending are disabled.`);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", () => {
  console.error("The local preview could not start. Check the build and whether the port is already in use.");
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 0; });
