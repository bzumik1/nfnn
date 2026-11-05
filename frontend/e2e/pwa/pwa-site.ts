import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  Dirent,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const FRONTEND = join(__dirname, '..', '..');
export const PROBE_WORKER = '/pwa-probe-sw.js';
export const PROBE_MANIFEST = '/pwa-probe.json';
export const MARKER = '/pwa-marker.txt';
export const VARIANTS = ['a', 'b'] as const;
export type Variant = (typeof VARIANTS)[number];

const SERVED = 'html';
const STARTUP_ATTEMPTS = 100;
const STARTUP_PAUSE_MS = 100;

export interface PwaSite {
  readonly url: string;
  readonly variant: Variant;
  switchTo(variant: Variant): void;
  remove(path: string): void;
  filesOnlyIn(variant: Variant): readonly string[];
  takeDown(): Promise<void>;
  bringUp(): Promise<void>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export function builtDist(): string {
  return resolve(FRONTEND, process.env.E2E_DIST ?? 'dist/frontend/browser');
}

export function nginxImage(): string {
  const dockerfile = readFileSync(join(FRONTEND, 'Dockerfile'), 'utf8');
  const image = /^FROM (nginx:\S+)\s*$/m.exec(dockerfile)?.[1];
  if (image === undefined) {
    throw new Error('frontend/Dockerfile names no nginx base image');
  }
  return image;
}

export async function startPwaSite(dist: string): Promise<PwaSite> {
  throw new Error(`startPwaSite: serving ${dist} behind nginx is not built yet`);
}
