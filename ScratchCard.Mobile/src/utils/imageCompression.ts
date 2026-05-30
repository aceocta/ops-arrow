import * as ImageManipulator from "expo-image-manipulator";

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_COMPRESS = 0.85;

export type CompressedImage = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Resize a picked image so its longest edge is at most `maxEdge` pixels and re-encode it as JPEG
 * at `compress` quality. Modern phones return ~3-5 MB photos by default — capping the dimensions
 * before upload typically cuts the payload 5-10× without hurting OCR accuracy.
 *
 * Falls back to returning the original URI if manipulation throws — better to upload a big photo
 * than to lose the user's capture entirely.
 */
export async function compressForUpload(
  uri: string,
  options?: { maxEdge?: number; compress?: number },
): Promise<CompressedImage> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const compress = options?.compress ?? DEFAULT_COMPRESS;

  try {
    // Read once so we can decide whether resizing is even needed (avoids a re-encode if the photo
    // is already small).
    const probe = await ImageManipulator.manipulateAsync(uri, []);
    const longest = Math.max(probe.width, probe.height);
    if (longest <= maxEdge) {
      const reencoded = await ImageManipulator.manipulateAsync(uri, [], {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return { uri: reencoded.uri, width: reencoded.width, height: reencoded.height };
    }

    const scale = maxEdge / longest;
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: Math.round(probe.width * scale), height: Math.round(probe.height * scale) } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG },
    );
    return { uri: result.uri, width: result.width, height: result.height };
  } catch {
    return { uri, width: 0, height: 0 };
  }
}
