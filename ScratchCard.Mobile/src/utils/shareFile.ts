import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/**
 * Helpers for exporting files on shared shop devices. Exports are written to the cache directory
 * (never the documents directory) and deleted as soon as the share sheet is dismissed, so reports
 * containing cash counts, staff data, etc. don't accumulate in the app sandbox.
 */

export type WriteShareableFileOptions = {
  encoding?: FileSystem.EncodingType;
};

/**
 * Writes `content` to a file in the cache directory and returns its uri. Pair with
 * `shareFileAndCleanup` so the file is removed after sharing.
 */
export async function writeShareableFile(
  filename: string,
  content: string,
  options: WriteShareableFileOptions = {}
): Promise<string> {
  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error("No cache directory is available on this device.");
  }

  const uri = `${directory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, content, {
    encoding: options.encoding ?? FileSystem.EncodingType.UTF8,
  });
  return uri;
}

/**
 * Opens the share sheet for `uri`, then deletes the file regardless of whether sharing succeeded —
 * the exported copy must not linger on a shared shop device.
 */
export async function shareFileAndCleanup(uri: string, options?: Sharing.SharingOptions): Promise<void> {
  try {
    await Sharing.shareAsync(uri, options);
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

/**
 * Deletes a temporary local image (camera capture / picker copy / resized upload copy) after it has
 * been uploaded. Only touches file:// uris inside the app sandbox — content:// and ph:// uris point
 * at the user's photo library originals and must never be deleted.
 */
export async function cleanupLocalImage(uri: string | null | undefined): Promise<void> {
  if (!uri || !uri.startsWith("file://")) {
    return;
  }

  const cacheDirectory = FileSystem.cacheDirectory;
  const documentDirectory = FileSystem.documentDirectory;
  const isInSandbox =
    (cacheDirectory ? uri.startsWith(cacheDirectory) : false) ||
    (documentDirectory ? uri.startsWith(documentDirectory) : false);
  if (!isInSandbox) {
    return;
  }

  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
