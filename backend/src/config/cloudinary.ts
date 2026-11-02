import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";
import { logger } from "./logger";

const cloudName = env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY;
const apiSecret = env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  const errMsg =
    "Missing Cloudinary configuration. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.";
  logger.error(errMsg);
  if (env.NODE_ENV === "production") {
    throw new Error(errMsg);
  }
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

/**
 * Safely deletes an audio/media asset from Cloudinary by its public ID.
 * Defaults to resource_type: "video" and type: "authenticated" for compliance recordings.
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  resourceType: "video" | "image" | "raw" = "video",
  deliveryType: "authenticated" | "upload" | "private" = "authenticated"
): Promise<boolean> {
  if (!publicId) return false;
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: deliveryType,
      invalidate: true,
    });
    const isOk = result.result === "ok" || result.result === "not found";
    logger.info({ publicId, resourceType, deliveryType, result: result.result }, "Cloudinary asset destruction executed");
    return isOk;
  } catch (err) {
    logger.error({ err, publicId, resourceType, deliveryType }, "Failed to destroy Cloudinary asset");
    return false;
  }
}

/**
 * Generates an HMAC-signed delivery URL for an audio recording in Cloudinary.
 * Used exclusively by the backend streaming proxy as an upstream resource.
 *
 * Security Guarantees:
 * - Generates official HMAC-SHA signature using server-side CLOUDINARY_API_SECRET (never exposed to client).
 * - Uses supported SDK parameters: resource_type: "video", type: "authenticated", secure: true, sign_url: true.
 * - Does not inject arbitrary expires_at query parameters on standard signed delivery URLs.
 * - Generates the exact signed original delivery URL for the stored asset.
 * - This URL is strictly internal to the backend proxy and is NEVER sent or redirected to the client browser.
 */
export function generateSignedCloudinaryAudioUrl(
  publicId: string,
  options: {
    resourceType?: "video" | "raw";
    deliveryType?: "authenticated" | "upload" | "private";
    format?: string;
  } = {}
): string {
  if (!publicId) return "";

  const resourceType = options.resourceType || "video";
  const deliveryType = options.deliveryType || "authenticated";

  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: deliveryType,
    format: options.format,
    sign_url: true,
    secure: true,
  });
}

export { cloudinary };