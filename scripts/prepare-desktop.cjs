#!/usr/bin/env node
/* eslint-disable */
/**
 * prepare-desktop.cjs — production frontend build for the Tauri desktop target.
 *
 * Next.js static export (output: "export") cannot contain route handlers, so
 * src/app/api is temporarily moved out of the tree for the duration of the
 * build and restored afterwards — even when the build fails.
 *
 * Usage: node scripts/prepare-desktop.cjs
 * (Invoked by Tauri via beforeBuildCommand in src-tauri/tauri.conf.json.)
 */

const { spawnSync } = require("child_process");
const { existsSync, mkdirSync, renameSync, rmSync } = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const apiDir = path.join(projectRoot, "src", "app", "api");
const stashDir = path.join(projectRoot, ".desktop-api-stash");

const PREFIX = "[prepare-desktop]";
function log(msg) {
  console.log(`${PREFIX} ${msg}`);
}
function logErr(msg) {
  console.error(`${PREFIX} ${msg}`);
}

/** Move src/app/api out of the tree. Returns true if it was stashed. */
function stashApiDir() {
  if (!existsSync(apiDir)) {
    log("src/app/api not present — nothing to stash");
    return false;
  }
  if (existsSync(stashDir)) {
    log(".desktop-api-stash already exists (stale, likely a crashed run) — removing it first");
    rmSync(stashDir, { recursive: true, force: true });
  }
  mkdirSync(path.dirname(stashDir), { recursive: true });
  renameSync(apiDir, stashDir);
  log("stashed: src/app/api -> .desktop-api-stash");
  return true;
}

/** Restore src/app/api from the stash and remove the stash dir. */
function restoreApiDir(stashed) {
  if (!stashed) return;
  try {
    if (existsSync(apiDir)) {
      // Robustness: a partial rebuild may have recreated src/app/api.
      log("src/app/api exists while stash is present — removing api dir before restore");
      rmSync(apiDir, { recursive: true, force: true });
    }
    if (existsSync(stashDir)) {
      renameSync(stashDir, apiDir);
      log("restored: src/app/api <- .desktop-api-stash (stash removed)");
    } else {
      logErr("stash dir missing and src/app/api missing — API routes were lost! Restore from git.");
      process.exitCode = 1;
    }
  } catch (err) {
    logErr(`FAILED to restore src/app/api: ${err && err.stack ? err.stack : err}`);
    process.exitCode = 1;
  }
}

let stashed = false;
let exitCode = 0;
try {
  stashed = stashApiDir();
  log("running production frontend build: npx next build (DESKTOP_EXPORT=1 NEXT_PUBLIC_DESKTOP=1) — this can take a few minutes…");
  const result = spawnSync("npx", ["next", "build"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true, // shell:true so `npx` resolves on Windows (npx.cmd)
    env: {
      ...process.env,
      DESKTOP_EXPORT: "1",
      NEXT_PUBLIC_DESKTOP: "1",
    },
  });
  if (result.error) throw result.error;
  exitCode = typeof result.status === "number" ? result.status : 1;
} catch (err) {
  logErr(`build spawn failed: ${err && err.stack ? err.stack : err}`);
  exitCode = 1;
} finally {
  restoreApiDir(stashed);
}

if (exitCode === 0) {
  log("desktop frontend build complete — static export written to out/");
} else {
  log(`build FAILED with exit code ${exitCode} (src/app/api was restored)`);
}
process.exit(exitCode);
