import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import {
  decryptText,
  encryptText,
  hashCode,
  hashToken,
  safeEqualHex,
} from "./encryption.ts";

before(() => {
  process.env.ENCRYPTION_KEY = "test-secret-key";
});

describe("encryption", () => {
  test("round-trips text through AES-GCM", () => {
    const text = "héllo 👋\nmulti-line";
    const ct = encryptText(text);
    assert.ok(ct.startsWith("v2:"));
    assert.notEqual(ct, encryptText(text), "random IV per message");
    assert.equal(decryptText(ct), text);
  });

  test("decrypts ciphertext written by the old crypto-js implementation", () => {
    // Produced by CryptoJS.AES.encrypt(text, "test-secret-key").toString()
    const legacy = "U2FsdGVkX18pxBgFbdRo2jaWu0WGrT6nzeVfH3DGuRs2oOtwSAx0PFXhVPVp1l32";
    assert.equal(decryptText(legacy), "héllo 👋 legacy\nline2");
  });

  test("tampered ciphertext fails closed", () => {
    const ct = encryptText("secret");
    const bad = ct.slice(0, -4) + (ct.endsWith("AAAA") ? "BBBB" : "AAAA");
    assert.equal(decryptText(bad), "");
  });

  test("hashCode matches the old crypto-js SHA256 output and is case-insensitive", () => {
    // CryptoJS.SHA256("AB12" + "test-secret-key").toString()
    const expected = "e6e5d243645b0afb88278c46a371c43efc1cf330843ba4a0d2085ee628a7e870";
    assert.equal(hashCode("AB12"), expected);
    assert.equal(hashCode("ab12"), expected);
  });

  test("owner token hashes compare in constant time", () => {
    assert.ok(safeEqualHex(hashToken("abc"), hashToken("abc")));
    assert.ok(!safeEqualHex(hashToken("abc"), hashToken("abd")));
    assert.ok(!safeEqualHex("", ""));
  });
});
