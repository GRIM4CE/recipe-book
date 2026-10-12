import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const original = process.env.ADMIN_USERNAMES;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_USERNAMES;
  else process.env.ADMIN_USERNAMES = original;
});

describe("adminUsernames", () => {
  it("is empty when unset", () => {
    delete process.env.ADMIN_USERNAMES;
    expect(loadConfig().adminUsernames).toEqual([]);
  });

  it("splits on commas, trims, and drops empty entries", () => {
    process.env.ADMIN_USERNAMES = " jon, ,mom ,,";
    expect(loadConfig().adminUsernames).toEqual(["jon", "mom"]);
  });
});
