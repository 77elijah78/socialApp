import { documentDownloads, documentKey, type DocumentSpec } from "./DocumentDownloads";
import { getAuthGeneration } from "./api";
import * as Sharing from "expo-sharing";

/** External apps cannot attach our Bearer header. Only an explicit user action
 * downloads the authorized bytes to this account's app-private file, then hands
 * that local file to the native share sheet. Never share a token-bearing URL. */
export async function shareMediaFile(spec: DocumentSpec): Promise<void> {
  const generation = getAuthGeneration();
  await documentDownloads.download(spec);
  if (generation !== getAuthGeneration()) return;
  const state = documentDownloads.get(documentKey(spec));
  if (state.status !== "ready" || !state.localUri)
    throw new Error(state.error ?? "This attachment couldn’t be downloaded.");
  // Static import keeps Metro's module graph resolvable. The previous dynamic
  // import produced an unknown numeric module in release/dev-client bundles.
  const available = await Sharing.isAvailableAsync();
  if (generation !== getAuthGeneration()) return;
  if (!available) throw new Error("File sharing requires a compatible native app.");
  await Sharing.shareAsync(state.localUri, { dialogTitle: spec.name });
}
