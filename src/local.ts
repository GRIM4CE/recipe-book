import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { createApp } from "./app.js";
import { createCognitoVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { createLocalPresigner, createS3Presigner } from "./uploads.js";

const config = loadConfig();
if (config.dbUrl.startsWith("file:")) mkdirSync(config.dataDir, { recursive: true });

const client = createClient({
  url: config.dbUrl,
  ...(config.dbAuthToken ? { authToken: config.dbAuthToken } : {}),
});
const db = createDb(client);
await db.applySchema();

const app = createApp({
  db,
  verifier: config.authEnabled
    ? createCognitoVerifier({
        userPoolId: config.cognitoUserPoolId,
        clientId: config.cognitoClientId,
      })
    : null,
  isProduction: config.isProduction,
  webOrigin: config.webOrigin,
  presigner: config.s3Enabled
    ? createS3Presigner({ bucket: config.s3Bucket, region: config.s3Region })
    : createLocalPresigner(),
  localPhotoDir: config.s3Enabled ? null : config.dataDir,
  photoBaseUrl: config.s3Enabled
    ? `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com`
    : "",
});

const server = app.listen(config.serverPort, () => {
  console.log(`recipe-book api listening on http://localhost:${config.serverPort}`);
  if (!config.authEnabled) {
    console.log("auth dev-bypass active: writes run as user \"dev\"");
  }
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
