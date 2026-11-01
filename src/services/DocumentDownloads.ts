import { getAccessToken, getAuthGeneration, refreshMediaAccessToken } from "./api";
import { isAuthenticatedMediaUrl, mediaHttpStatus, mediaRequestSource } from "../utils/mediaRequests";
import * as FileSystem from "expo-file-system/legacy";

export interface DocumentSpec {
  ownerId: string;
  id: string;
  uri: string;
  name: string;
  localSource?: boolean;
}
export interface DocumentDownloadState {
  status: "idle" | "queued" | "downloading" | "ready" | "error";
  bytes: number;
  total?: number;
  localUri?: string;
  error?: string;
}
const idle: DocumentDownloadState = { status: "idle", bytes: 0 };
const safe = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 96) || "file";
function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(36);
}
export const documentKey = (spec: DocumentSpec) =>
  `${spec.ownerId}:${spec.id}:${spec.uri}`;
const directory = () =>
  FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}chat-downloads/`
    : null;
function destination(spec: DocumentSpec) {
  const root = directory();
  if (!root)
    throw new Error("On-device file downloads require the native app.");
  const extension = /\.[a-z0-9]{1,10}$/i.exec(spec.name)?.[0] || "";
  let filename = safe(spec.name);
  if (extension && !filename.toLowerCase().endsWith(extension.toLowerCase()))
    filename = filename.slice(0, 80) + extension;
  return `${root}${safe(spec.ownerId)}/${safe(spec.id)}-${hash(spec.uri)}-${filename}`;
}

/** User-initiated native downloads survive row virtualization, but not logout.
 * Two concurrent transfers, per-document subscriptions, bounded RAM snapshots.
 * Files remain in app-private storage; their existence is checked on remount. */
export class DocumentDownloads {
  private states = new Map<string, DocumentDownloadState>();
  private listeners = new Map<string, Set<() => void>>();
  private jobs = new Map<
    string,
    { promise: Promise<void>; pause?: () => Promise<unknown> }
  >();
  private active = 0;
  private waiting: (() => void)[] = [];
  private generation = 0;
  get(key: string) {
    return this.states.get(key) ?? idle;
  }
  subscribe(key: string, callback: () => void) {
    const group = this.listeners.get(key) ?? new Set();
    group.add(callback);
    this.listeners.set(key, group);
    return () => {
      group.delete(callback);
      if (!group.size) this.listeners.delete(key);
      this.trim();
    };
  }
  private trim() {
    for (const key of this.states.keys()) {
      if (this.states.size <= 80) break;
      if (!this.jobs.has(key) && !this.listeners.has(key))
        this.states.delete(key);
    }
  }
  private publish(key: string, state: DocumentDownloadState) {
    this.states.delete(key);
    this.states.set(key, state);
    this.listeners.get(key)?.forEach((listener) => listener());
    this.trim();
  }
  private acquire() {
    if (this.active < 2) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((done) => this.waiting.push(done));
  }
  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
  async inspect(spec: DocumentSpec) {
    const key = documentKey(spec),
      epoch = this.generation;
    if (this.jobs.has(key) || !directory()) return;
    try {
      const path =
        spec.localSource && /^file:\/\//.test(spec.uri)
          ? spec.uri
          : destination(spec);
      const info = await FileSystem.getInfoAsync(path);
      if (epoch !== this.generation || this.jobs.has(key)) return;
      if (info.exists)
        this.publish(key, {
          status: "ready",
          bytes: info.size ?? 0,
          total: info.size,
          localUri: path,
        });
      else if (this.get(key).status === "ready") this.publish(key, idle);
    } catch {
      /* The explicit download action reports errors; mounting is read-only. */
    }
  }
  download(spec: DocumentSpec): Promise<void> {
    const key = documentKey(spec),
      active = this.jobs.get(key);
    if (active) return active.promise;
    const epoch = this.generation;
    const job: { promise: Promise<void>; pause?: () => Promise<unknown> } = {
      promise: Promise.resolve(),
    };
    job.promise = this.perform(spec, epoch, job).finally(() => {
      if (this.jobs.get(key) === job) this.jobs.delete(key);
      this.trim();
    });
    this.jobs.set(key, job);
    return job.promise;
  }
  private async perform(
    spec: DocumentSpec,
    epoch: number,
    job: { pause?: () => Promise<unknown> },
  ) {
    const authEpoch = getAuthGeneration();
    const key = documentKey(spec),
      current = () => epoch === this.generation && authEpoch === getAuthGeneration();
    this.publish(key, { status: "queued", bytes: 0 });
    await this.acquire();
    try {
      if (!current()) return;
      if (
        !/^https?:\/\//i.test(spec.uri) &&
        !(spec.localSource && /^(file|content):\/\//i.test(spec.uri))
      )
        throw new Error("This file address is unavailable.");
      const path = destination(spec);
      await FileSystem.makeDirectoryAsync(
        path.slice(0, path.lastIndexOf("/")),
        { intermediates: true },
      );
      if (!current()) return;
      const existing = await FileSystem.getInfoAsync(path);
      if (!current()) return;
      if (!existing.exists) {
        this.publish(key, { status: "downloading", bytes: 0 });
        const partial = `${path}.part`;
        await FileSystem.deleteAsync(partial, { idempotent: true });
        let expected: number | undefined;
        if (/^(file|content):\/\//i.test(spec.uri))
          await FileSystem.copyAsync({ from: spec.uri, to: partial });
        else {
          let token = getAccessToken();
          for (let attempt = 0; attempt < 2; attempt++) {
            if (!current()) return;
            let lastBucket = -1;
            expected = undefined;
            const source = mediaRequestSource(spec.uri, token);
            if (!source.uri) throw new Error("This file address is unavailable.");
            const transfer = FileSystem.createDownloadResumable(
              source.uri,
              partial,
              source.headers ? { headers: source.headers } : {},
              (progress) => {
                if (!current()) return;
                const total = progress.totalBytesExpectedToWrite > 0
                  ? progress.totalBytesExpectedToWrite : undefined;
                expected = total;
                const bucket = total ? Math.floor((progress.totalBytesWritten / total) * 100)
                  : Math.floor(progress.totalBytesWritten / 65536);
                if (bucket === lastBucket) return;
                lastBucket = bucket;
                this.publish(key, { status: "downloading", bytes: progress.totalBytesWritten, total });
              },
            );
            job.pause = () => transfer.pauseAsync();
            let failure: unknown;
            const result = await transfer.downloadAsync().catch(error => { failure = error; return undefined; });
            if (!current()) return;
            const status = result?.status ?? mediaHttpStatus(failure);
            if (attempt === 0 && token && isAuthenticatedMediaUrl(source.uri) &&
                (status === 401 || status === 403)) {
              const fresh = await refreshMediaAccessToken(token, authEpoch);
              if (!current()) return;
              if (fresh) {
                token = fresh;
                await FileSystem.deleteAsync(partial, { idempotent: true });
                continue;
              }
            }
            if (failure) throw failure;
            if (Object.entries(result?.headers ?? {}).some(([key, value]) =>
              key.toLowerCase() === "content-encoding" && value !== "identity")) expected = undefined;
            if (!result || result.status < 200 || result.status >= 300)
              throw new Error(result?.status === 401 || result?.status === 403
                ? "You don’t have access to this file, or your session has expired."
                : "Couldn’t download this file. Tap to retry.");
            break;
          }
        }
        if (!current()) return;
        const completed = await FileSystem.getInfoAsync(partial);
        if (
          !completed.exists ||
          (expected != null && completed.size !== expected)
        )
          throw new Error("The file download was interrupted. Tap to retry.");
        await FileSystem.moveAsync({ from: partial, to: path });
      }
      if (!current()) return;
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) throw new Error("The downloaded file is unavailable.");
      if (current())
        this.publish(key, {
          status: "ready",
          bytes: info.size ?? 0,
          total: info.size,
          localUri: path,
        });
    } catch (error) {
      if (current()) {
        // Never allow an incomplete file to masquerade as a successful download.
        try {
          await FileSystem.deleteAsync(`${destination(spec)}.part`, {
            idempotent: true,
          });
        } catch {
          /* best effort */
        }
        this.publish(key, {
          status: "error",
          bytes: 0,
          error:
            error instanceof Error
              ? error.message
              : "Download failed. Tap to retry.",
        });
      }
    } finally {
      this.release();
    }
  }
  async clear() {
    this.generation++;
    const jobs = [...this.jobs.values()];
    await Promise.allSettled(jobs.map((job) => job.pause?.()));
    await Promise.allSettled(jobs.map((job) => job.promise));
    this.jobs.clear();
    this.states.clear();
    for (const group of this.listeners.values())
      group.forEach((listener) => listener());
    const root = directory();
    if (root) await FileSystem.deleteAsync(root, { idempotent: true });
  }
}
export const documentDownloads = new DocumentDownloads();
