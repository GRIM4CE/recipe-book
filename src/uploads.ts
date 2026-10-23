import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Photo bytes never transit the API: clients PUT directly to the returned
// uploadUrl. In prod that's a presigned S3 URL; locally it's a dev route that
// writes to disk.
export interface Presigner {
  presign(size: number): Promise<{ uploadUrl: string; key: string }>;
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const PHOTO_KEY = /^photos\/[0-9a-f-]{36}\.jpg$/;
export const isValidPhotoKey = (key: string) => PHOTO_KEY.test(key);

// Parses the client-declared photo size from a presign request body. S3 signs
// the exact Content-Length into the URL, so an upload of any other size (and
// therefore anything over the cap) is rejected by S3.
export function parsePhotoSize(body: unknown): number | string {
  const size = (body as { size?: unknown } | null | undefined)?.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1) {
    return "size (bytes) is required";
  }
  if (size > MAX_PHOTO_BYTES) {
    return `photo must be at most ${MAX_PHOTO_BYTES} bytes`;
  }
  return size;
}

const newKey = () => `photos/${randomUUID()}.jpg`;

export function createS3Presigner(opts: { bucket: string; region: string }): Presigner {
  const client = new S3Client({ region: opts.region });
  return {
    async presign(size) {
      const key = newKey();
      const command = new PutObjectCommand({
        Bucket: opts.bucket,
        Key: key,
        ContentType: "image/jpeg",
        ContentLength: size,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
      return { uploadUrl, key };
    },
  };
}

export function createLocalPresigner(): Presigner {
  return {
    async presign(_size) {
      const key = newKey();
      return { uploadUrl: `/api/uploads/${key}`, key };
    },
  };
}
