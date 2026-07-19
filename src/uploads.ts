import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Photo bytes never transit the API: clients PUT directly to the returned
// uploadUrl. In prod that's a presigned S3 URL; locally it's a dev route that
// writes to disk.
export interface Presigner {
  presign(): Promise<{ uploadUrl: string; key: string }>;
}

const newKey = () => `photos/${randomUUID()}.jpg`;

export function createS3Presigner(opts: { bucket: string; region: string }): Presigner {
  const client = new S3Client({ region: opts.region });
  return {
    async presign() {
      const key = newKey();
      const command = new PutObjectCommand({
        Bucket: opts.bucket,
        Key: key,
        ContentType: "image/jpeg",
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
      return { uploadUrl, key };
    },
  };
}

export function createLocalPresigner(): Presigner {
  return {
    async presign() {
      const key = newKey();
      return { uploadUrl: `/api/uploads/${key}`, key };
    },
  };
}
