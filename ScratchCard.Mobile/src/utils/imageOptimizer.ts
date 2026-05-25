import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { reportError } from "./crashReporter";

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_COMPRESS = 0.7;

export type OptimizedImage = {
  uri: string;
  base64: string;
  width: number;
  height: number;
  byteSize: number;
};

type OptimizeOptions = {
  maxDimension?: number;
  compress?: number;
  format?: ImageManipulator.SaveFormat;
};

export async function optimizeImage(
  sourceUri: string,
  options: OptimizeOptions = {}
): Promise<OptimizedImage> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const compress = options.compress ?? DEFAULT_COMPRESS;
  const format = options.format ?? ImageManipulator.SaveFormat.JPEG;

  try {
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: maxDimension } }],
      {
        compress,
        format,
        base64: true,
      }
    );

    let byteSize = 0;
    if (result.base64) {
      byteSize = Math.ceil((result.base64.length * 3) / 4);
    } else {
      try {
        const info = await FileSystem.getInfoAsync(result.uri);
        byteSize = (info as { size?: number }).size ?? 0;
      } catch {
        byteSize = 0;
      }
    }

    return {
      uri: result.uri,
      base64: result.base64 ?? "",
      width: result.width,
      height: result.height,
      byteSize,
    };
  } catch (error) {
    reportError(error, { phase: "optimize-image", sourceUri });
    throw error;
  }
}
