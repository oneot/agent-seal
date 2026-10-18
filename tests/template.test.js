import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { BROKER_URL, generatePage } from "../assets/template.js";

test("generates one complete standalone HTML file with the pinned Web Chat dependency", () => {
  const html = generatePage("dummy-sealed-value");
  assert.ok(html.startsWith("<!DOCTYPE html>\n"));
  assert.ok(html.endsWith("</html>\n"));
  assert.equal(BROKER_URL,
    "https://dl-broker-juwon-4jt3z.azurewebsites.net/api/directlineToken");
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), [
    "https://cdn.botframework.com/botframework-webchat/4.18.0/webchat.js"
  ]);
  assert.doesNotMatch(html, /type="module"|\.\/assets\/|__SEALED__|__BROKER_URL__/);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  assert.doesNotThrow(() => new Script(inline[0][1]));
});

test("serializes embedded values without creating additional script tags", () => {
  const value = '";</script><script>alert("dummy")</script>';
  const html = generatePage(value);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.equal(JSON.parse(html.match(/const SEALED = (.*);/)[1]), value);
  assert.doesNotThrow(() => new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]));
});
