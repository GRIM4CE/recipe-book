import { resolve } from "node:path";

export interface Config {
  // libsql URL: file:./data/recipe-book.db locally, libsql://... (Turso) in prod.
  dbUrl: string;
  dbAuthToken: string;
  // Port the local dev server listens on.
  serverPort: number;
  // Extra allowed CORS origin (the deployed Amplify URL). localhost:5173 is
  // always allowed.
  webOrigin: string;
  // Bearer secret for /api/external/* (importer). Empty = external API disabled.
  externalApiSecret: string;
  externalEnabled: boolean;
  // Anthropic API key for recipe import extraction. Empty = extraction
  // disabled (the route 503s).
  anthropicApiKey: string;
  // Cognito pool/client for verifying UI write tokens. Both empty = auth
  // dev-bypass (writes run as user "dev"), refused in production.
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoRegion: string;
  authEnabled: boolean;
  // S3 photo storage. Empty bucket = local-disk photo mode under dataDir.
  s3Bucket: string;
  s3Region: string;
  s3Enabled: boolean;
  // Local photo storage in dev.
  dataDir: string;
  isProduction: boolean;
}

export function loadConfig(): Config {
  const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  const cognitoClientId = process.env.COGNITO_CLIENT_ID ?? "";
  const s3Bucket = process.env.S3_BUCKET ?? "";
  const externalApiSecret = process.env.EXTERNAL_API_SECRET ?? "";
  const region = process.env.AWS_REGION ?? "us-east-1";
  return {
    dbUrl: process.env.DB_URL ?? "file:./data/recipe-book.db",
    dbAuthToken: process.env.DB_AUTH_TOKEN ?? "",
    serverPort: Number(process.env.RECIPE_SERVER_PORT ?? 4181),
    webOrigin: (process.env.WEB_ORIGIN ?? "").replace(/\/+$/, ""),
    externalApiSecret,
    externalEnabled: Boolean(externalApiSecret),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    cognitoUserPoolId,
    cognitoClientId,
    cognitoRegion: process.env.COGNITO_REGION ?? region,
    authEnabled: Boolean(cognitoUserPoolId && cognitoClientId),
    s3Bucket,
    s3Region: process.env.S3_REGION ?? region,
    s3Enabled: Boolean(s3Bucket),
    dataDir: resolve(process.env.RECIPE_DATA_DIR ?? "./data"),
    isProduction: process.env.NODE_ENV === "production",
  };
}
