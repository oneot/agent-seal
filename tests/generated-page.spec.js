import { test, expect } from "@playwright/test";
import { BROKER_URL, generatePage } from "../assets/template.js";

const PAGE_URL = "https://chat.example.test/index.html";
const CDN = "https://cdn.botframework.com/botframework-webchat/4.18.0/webchat.js";
const SEALED = "dummy-sealed-value";

test.afterEach(async ({ page }) => {
  expect(await page.pageErrors()).toEqual([]);
});

async function openGenerated(page, options = {}) {
  const requests = [];
  const unexpected = [];
  await page.route("**/*", async route => {
    const request = route.request();
    if (request.url() === PAGE_URL) {
      await route.fulfill({ contentType: "text/html", body: generatePage(SEALED) });
    } else if (request.url() === CDN) {
      if (options.cdnFailure) return route.abort();
      await route.fulfill({
        contentType: "text/javascript",
        body: `
          window.chatCalls = { tokens: [], activities: [], renders: [], subscriptions: 0, order: [] };
          window.WebChat = {
            createDirectLine(options) {
              window.chatCalls.order.push("create");
              window.chatCalls.tokens.push(options);
              ${options.createFailure ? 'throw new Error("Test DirectLine failure");' : ""}
              return {
                postActivity(activity) {
                  window.chatCalls.order.push("post");
                  window.chatCalls.activities.push(activity);
                  return {
                    subscribe(observer) {
                      window.chatCalls.order.push("subscribe");
                      window.chatCalls.subscriptions++;
                      ${options.greetingFailure ? 'queueMicrotask(() => observer.error(new Error("Test greeting failure")));' : ""}
                    }
                  };
                }
              };
            },
            renderWebChat(options, element) {
              window.chatCalls.order.push("render");
              ${options.renderFailure ? 'throw new Error("Test render failure");' : ""}
              window.chatCalls.renders.push({ locale: options.locale, element: element.id });
              element.textContent = "Mock chat";
            }
          };
        `
      });
    } else if (request.url() === BROKER_URL) {
      requests.push({
        method: request.method(), headers: request.headers(), body: request.postData()
      });
      if (options.networkFailure) return route.abort();
      await route.fulfill({
        status: options.status ?? 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://chat.example.test"
        },
        body: options.body ?? JSON.stringify({ token: "dummy-directline-token" })
      });
    } else {
      unexpected.push(request.url());
      await route.abort();
    }
  });
  await page.goto(PAGE_URL);
  return { requests, unexpected };
}

test("preserves simple POST, the token contract, locale and greeting event", async ({ page }) => {
  const { requests, unexpected } = await openGenerated(page);
  await expect(page.locator("#webchat")).toHaveText("Mock chat");
  await expect(page.locator("#webchat")).toHaveCSS("height", "600px");
  await expect(page.locator("#status")).toBeHidden();
  expect(unexpected).toEqual([]);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("POST");
  expect(requests[0].headers["content-type"]).toMatch(/^text\/plain(?:;|$)/i);
  expect(JSON.parse(requests[0].body)).toEqual({ sealed: SEALED });
  expect(await page.evaluate(() => window.chatCalls)).toEqual({
    tokens: [{ token: "dummy-directline-token" }],
    activities: [{ type: "event", name: "startConversation", from: { id: "user" } }],
    renders: [{ locale: "ko-KR", element: "webchat" }],
    subscriptions: 1,
    order: ["create", "post", "subscribe", "render"]
  });
});

test("shows a loading status while waiting for the broker", async ({ page }) => {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (...args) => new Promise(resolve => {
      window.releaseBroker = () => resolve(fetch(...args));
    });
  });
  await openGenerated(page);
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#status")).toHaveText("채팅에 연결하는 중입니다...");
  await expect(page.locator("#status")).toHaveAttribute("aria-live", "polite");
  await page.evaluate(() => window.releaseBroker());
  await expect(page.locator("#webchat")).toHaveText("Mock chat");
  await expect(page.locator("#status")).toBeHidden();
});

for (const status of [401, 403, 429, 500]) {
  test(`does not use a token from an HTTP ${status} response`, async ({ page }) => {
    await openGenerated(page, { status });
    await expect(page.locator("#status")).toContainText(`HTTP ${status}`);
    expect(await page.evaluate(() => window.chatCalls.tokens)).toEqual([]);
    await expect(page.locator("#webchat")).toBeEmpty();
  });
}

test("reports invalid JSON instead of a parsing exception", async ({ page }) => {
  await openGenerated(page, { body: "<html>not JSON</html>" });
  await expect(page.locator("#status")).toContainText("서버 응답을 읽을 수 없습니다");
  expect(await page.evaluate(() => window.chatCalls.tokens)).toEqual([]);
});

for (const data of [
  {}, null, [], { token: null }, { token: 123 }, { token: "" }, { token: "  " },
  { error: '<img src=x onerror="alert(1)">private broker details' }
]) {
  test(`rejects a missing or invalid token: ${JSON.stringify(data)}`, async ({ page }) => {
    await openGenerated(page, { body: JSON.stringify(data) });
    await expect(page.locator("#status")).toContainText("연결 토큰을 받지 못했습니다");
    await expect(page.locator("#status")).not.toContainText("private broker details");
    await expect(page.locator("#status img")).toHaveCount(0);
    expect(await page.evaluate(() => window.chatCalls.tokens)).toEqual([]);
  });
}

test("reports a network failure", async ({ page }) => {
  await openGenerated(page, { networkFailure: true });
  await expect(page.locator("#status")).toContainText("서버에 연결하지 못했습니다");
  expect(await page.evaluate(() => window.chatCalls.tokens)).toEqual([]);
});

test("reports a failed Web Chat load without calling the broker", async ({ page }) => {
  const { requests } = await openGenerated(page, { cdnFailure: true });
  await expect(page.locator("#status")).toContainText("채팅 구성 요소를 불러오지 못했습니다");
  expect(requests).toEqual([]);
});

for (const failure of ["createFailure", "renderFailure"]) {
  test(`reports chat initialization failure: ${failure}`, async ({ page }) => {
    await openGenerated(page, { [failure]: true });
    await expect(page.locator("#status")).toContainText("채팅을 시작하지 못했습니다");
  });
}

test("keeps the chat available when the greeting event fails", async ({ page }) => {
  await openGenerated(page, { greetingFailure: true });
  await expect(page.locator("#webchat")).toHaveText("Mock chat");
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#status")).toContainText("첫 인사를 요청하지 못했습니다");
});
