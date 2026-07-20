import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import serverless from "serverless-http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb, type Db } from "../src/db.js";
import type { ExtractInput, Extractor } from "../src/extract.js";

// Regression test: serverless-http v3 marked its mock request as already
// complete, so Express 5's body parser skipped it and req.body stayed a raw
// Buffer — every JSON POST through the Lambda Function URL failed validation
// ("provide exactly one of text or image") while supertest kept passing.
// This drives requests through serverless-http the way prod does.

function functionUrlEvent(path: string, body: string) {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
    },
    requestContext: {
      domainName: "example.lambda-url.us-east-1.on.aws",
      http: {
        method: "POST",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "test",
      stage: "$default",
      timeEpoch: 0,
    },
    body,
    isBase64Encoded: false,
  };
}

let dir: string;
let client: Client;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "recipe-lambda-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = createDb(client);
  await db.applySchema();
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("JSON bodies through serverless-http", () => {
  it("parses the extract payload", async () => {
    const calls: ExtractInput[] = [];
    const extractor: Extractor = {
      async extract(input) {
        calls.push(input);
        return {
          found: true,
          title: "Pancakes",
          summary: "Fluffy",
          ingredients: ["2 cups flour"],
          instructions: ["Mix."],
          category: null,
        };
      },
    };
    const handler = serverless(createApp({ db, extractor }));
    const res = (await handler(
      functionUrlEvent("/api/extract", JSON.stringify({ text: "pancake blob" })),
      {},
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(calls[0].text).toBe("pancake blob");
  });

  it("parses recipe writes", async () => {
    const handler = serverless(createApp({ db }));
    const res = (await handler(
      functionUrlEvent(
        "/api/recipes",
        JSON.stringify({ title: "Toast", ingredients: ["bread"], instructions: ["toast it"] }),
      ),
      {},
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).title).toBe("Toast");
  });
});
