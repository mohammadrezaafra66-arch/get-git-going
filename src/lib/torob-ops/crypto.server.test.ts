import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTorobOpsSessionToken,
  hashTorobOpsPassword,
  hashTorobOpsSessionToken,
  verifyTorobOpsPassword,
} from "./crypto.server.ts";

test("torob ops password hash verifies", () => {
  const hash = hashTorobOpsPassword("secret-pass-99");
  assert.equal(verifyTorobOpsPassword("secret-pass-99", hash), true);
  assert.equal(verifyTorobOpsPassword("wrong", hash), false);
});

test("session token hash is stable", () => {
  const token = createTorobOpsSessionToken();
  assert.equal(hashTorobOpsSessionToken(token), hashTorobOpsSessionToken(token));
  assert.notEqual(hashTorobOpsSessionToken(token), hashTorobOpsSessionToken(token + "x"));
});
