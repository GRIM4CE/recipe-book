// Lambda entry. Imports @libsql/client/web — the default client pulls a
// native binding that esbuild can't bundle; the web client speaks HTTP to
// Turso, which is all Lambda needs.
import { createClient } from "@libsql/client/web";
import serverless from "serverless-http";
import { createApp } from "./app.js";
import { createCognitoVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { createS3Presigner } from "./uploads.js";

const config = loadConfig();
const client = createClient({
  url: config.dbUrl,
  ...(config.dbAuthToken ? { authToken: config.dbAuthToken } : {}),
});
const db = createDb(client);

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
    : null,
  photoBaseUrl: config.s3Enabled
    ? `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com`
    : "",
  externalSecret: config.externalApiSecret,
});

const wrapped = serverless(app);

// The idempotent schema runs once per cold start, so a fresh Turso database
// works without a separate migration step.
let schemaReady: Promise<void> | undefined;

export const handler = async (event: object, context: object) => {
  schemaReady ??= db.applySchema();
  await schemaReady;
  return wrapped(event, context);
};
