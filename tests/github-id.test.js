import { test } from "node:test";
import assert from "node:assert/strict";
import { githubId } from "../assets/github-id.js";

const accepted = [
  ["oneot", "oneot"],
  [" @OneOT ", "oneot"],
  ["a", "a"],
  ["0", "0"],
  ["a-b-c", "a-b-c"],
  ["a".repeat(39), "a".repeat(39)],
  ["github.com/oneot", "oneot"],
  ["https://github.com/OneOT/", "oneot"],
  ["http://github.com/oneot", "oneot"],
  ["https://www.github.com/oneot", "oneot"],
  ["https://github.com/oneot/agent-seal?tab=readme#top", "oneot"],
  ["https://github.com:443/oneot", "oneot"],
  ["oneot.github.io", "oneot"],
  ["https://OneOT.github.io/agent-seal/", "oneot"],
  ["http://oneot.github.io/index.html?x=1#chat", "oneot"],
  ["https://oneot.github.io:443/", "oneot"],
  ["a-b.github.io", "a-b"]
];

for (const [value, expected] of accepted) {
  test(`normalizes ${JSON.stringify(value)}`, () => {
    assert.equal(githubId(value), expected);
  });
}

const rejected = [
  "", " ", "@", "@@oneot", "@github.com/oneot",
  "a".repeat(40), "-oneot", "oneot-", "one--ot", "one_ot", "one.ot", "한글",
  "one ot", "github.com", "https://github.com/", "https://github.com//oneot",
  "https://github.com/oneot%2Fother", "https://github.com/oneot--other",
  "https://github.com/oneot%20", "https://github.com/oneot name",
  "https://notgithub.com/oneot", "https://github.com.evil.test/oneot",
  "https://evil.test/github.com/oneot", "https://api.github.com/oneot",
  "https://oneot.github.io.evil.test", "https://sub.oneot.github.io",
  "https://github.io/oneot", "https://one--ot.github.io",
  "https://github.com@evil.test/oneot", "https://evil.test@github.com/oneot",
  "https://user:password@github.com/oneot", "https://user@oneot.github.io",
  "https://github.com:8443/oneot", "https://oneot.github.io:8443",
  "ftp://github.com/oneot", "javascript://github.com/oneot",
  "https://github.com\\oneot", "https://github.com/\noneot",
  "github.com/oneot<script>", "https://github.com:invalid/oneot"
];

for (const value of rejected) {
  test(`rejects ${JSON.stringify(value)}`, () => {
    assert.equal(githubId(value), null);
  });
}
