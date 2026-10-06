import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { fileHash, privateJson } from "../src/lib/collection/films/media-files";

test("private file helpers retain exact hashes and atomic owner-only JSON receipts", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "media-file-helpers-"),
  );
  try {
    const bytes = Buffer.from("Synthetic original recording bytes");
    const original = path.join(directory, "original.webm");
    const receipt = path.join(directory, "receipt.json");
    await writeFile(original, bytes);
    assert.equal(
      await fileHash(original),
      createHash("sha256").update(bytes).digest("hex"),
    );
    await privateJson(receipt, { version: 1 });
    await privateJson(receipt, { version: 2 });
    assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), {
      version: 2,
    });
    assert.equal((await stat(receipt)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(directory)).sort(), [
      "original.webm",
      "receipt.json",
    ]);
    assert.deepEqual(await readFile(original), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("web interview preparation cannot transitively load a native renderer or bundler", async () => {
  const root = path.resolve("src");
  const visited = new Set<string>();
  const forbidden =
    /^(@remotion\/(?:bundler|renderer)|@rspack\/|esbuild(?:\/|$))/;
  async function resolveLocal(specifier: string, from: string) {
    const base = specifier.startsWith("@/")
      ? path.join(root, specifier.slice(2))
      : path.resolve(path.dirname(from), specifier);
    for (const suffix of ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"])
      if ((await stat(`${base}${suffix}`).catch(() => null))?.isFile())
        return `${base}${suffix}`;
    throw new Error(
      `Missing local runtime dependency: ${specifier} from ${from}`,
    );
  }
  async function visit(file: string, chain: string[]) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const specifiers: string[] = [];
    function inspect(node: ts.Node) {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const typeOnly =
          clause?.isTypeOnly ||
          (!clause?.name &&
            named &&
            ts.isNamedImports(named) &&
            named.elements.length > 0 &&
            named.elements.every((item) => item.isTypeOnly));
        if (!typeOnly) specifiers.push(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifiers.push(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifiers.push(node.arguments[0].text);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
    for (const specifier of specifiers) {
      assert.equal(
        forbidden.test(specifier),
        false,
        `Web dependency reached a worker-only package: ${[...chain, file, specifier].join(" -> ")}`,
      );
      if (specifier.startsWith(".") || specifier.startsWith("@/"))
        await visit(await resolveLocal(specifier, file), [...chain, file]);
    }
  }
  await visit(path.join(root, "lib/collection/interview-preparation.ts"), []);
  assert.ok(
    visited.has(path.join(root, "lib/collection/films/media-files.ts")),
  );
  assert.equal(
    visited.has(path.join(root, "lib/collection/films/render.ts")),
    false,
  );
});
