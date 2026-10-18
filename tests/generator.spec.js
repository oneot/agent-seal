import { test, expect } from "@playwright/test";
import { DUMMY_SECRET, enterSecret, generate, openGenerator } from "./helpers.js";

test.afterEach(async ({ page }) => {
  expect(await page.pageErrors()).toEqual([]);
});

async function mockClipboard(page, primary = "success", fallback = "success") {
  await page.addInitScript(({ primary, fallback }) => {
    window.clipboardCalls = { writes: [], fallbacks: [], pending: [] };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: primary === "missing" ? undefined : {
        writeText(text) {
          window.clipboardCalls.writes.push(text);
          if (primary === "pending") {
            return new Promise((resolve, reject) => window.clipboardCalls.pending.push({ resolve, reject }));
          }
          return primary === "success" ? Promise.resolve() : Promise.reject(new Error("Clipboard denied"));
        }
      }
    });
    document.execCommand = command => {
      const textarea = document.querySelector("textarea");
      window.clipboardCalls.fallbacks.push({
        command, value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd
      });
      if (fallback === "throw") throw new Error("Copy is not supported");
      return fallback === "success";
    };
  }, { primary, fallback });
}

test("serves every asset under the Pages subpath and keeps the secret local", async ({ page }) => {
  const requests = [];
  page.on("request", request => requests.push({
    url: request.url(), method: request.method(), body: request.postData()
  }));
  await page.addInitScript(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt = (algorithm, key, data) => {
      if (algorithm.name === "AES-GCM") {
        window.testPlaintext = JSON.parse(new TextDecoder().decode(data));
      }
      return encrypt(algorithm, key, data);
    };
  });
  await openGenerator(page);
  await generate(page, "https://GitHub.com/OneOT/agent-seal");
  const html = await page.locator("#code").textContent();
  expect(html).not.toContain(DUMMY_SECRET);
  expect(html).toMatch(/const SEALED = "[A-Za-z0-9_-]+";/);
  expect(await page.evaluate(() => window.testPlaintext)).toEqual({
    s: DUMMY_SECRET, o: "https://oneot.github.io"
  });
  expect(await page.locator("#input").inputValue()).toBe("");
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]))
    .toEqual([0, 0, ""]);
  expect(requests.every(request =>
    request.url.startsWith("http://127.0.0.1:4173/agent-seal/") &&
    request.method === "GET" && request.body === null
  )).toBe(true);
  expect(requests.map(request => new URL(request.url).pathname).sort()).toEqual([
    "/agent-seal/", "/agent-seal/assets/app.js", "/agent-seal/assets/github-id.js",
    "/agent-seal/assets/seal.js", "/agent-seal/assets/styles.css", "/agent-seal/assets/template.js"
  ]);
});

test("validates input and does not let an old error timer overwrite the result", async ({ page }) => {
  await page.clock.install();
  await openGenerator(page);
  const input = page.locator("#input");
  const send = page.locator("#send");
  await expect(send).toBeDisabled();
  await input.fill("short");
  await send.click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#live")).toContainText("암호를 그대로");
  await expect(input).toHaveValue("");
  await enterSecret(page);
  await input.fill("https://notgithub.com/oneot");
  await send.click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#live")).toContainText("GitHub 아이디만");
  await input.fill("@oneot");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await send.click();
  await expect(page.locator("#code")).toBeVisible();
  await page.clock.fastForward(3500);
  await expect(page.locator("#live")).toContainText("코드가 만들어졌습니다");
});

test("Enter respects composition state and the legacy IME key code", async ({ page }) => {
  await openGenerator(page);
  const input = page.locator("#input");
  await input.fill(DUMMY_SECRET);
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true, keyCode: 13 });
  await expect(input).toHaveValue(DUMMY_SECRET);
  await expect(page.locator("#send")).toBeEnabled();
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: false, keyCode: 229 });
  await expect(input).toHaveValue(DUMMY_SECRET);
  await expect(input).toHaveAttribute("type", "password");
  await input.press("Enter");
  await expect(input).toHaveAttribute("type", "text");
});

test("blocks duplicate submission and discards a late encryption after restart", async ({ page }) => {
  await page.addInitScript(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    window.encryptCalls = 0;
    crypto.subtle.encrypt = (algorithm, key, data) => {
      if (algorithm.name !== "AES-GCM") {
        return encrypt(algorithm, key, data).then(result => {
          window.encryptionFinished = true;
          return result;
        });
      }
      window.encryptCalls++;
      return new Promise(resolve => {
        window.finishEncryption = () => resolve(encrypt(algorithm, key, data));
      });
    };
  });
  await openGenerator(page);
  await enterSecret(page);
  await page.locator("#input").fill("oneot");
  await page.locator("#input").press("Enter");
  await expect(page.locator("#box")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#input")).toHaveJSProperty("readOnly", true);
  await expect.poll(() => page.evaluate(() => window.encryptCalls)).toBe(1);
  await page.locator("#send").dispatchEvent("click");
  expect(await page.evaluate(() => window.encryptCalls)).toBe(1);
  await page.locator("#again").dispatchEvent("click");
  await page.evaluate(() => window.finishEncryption());
  await expect.poll(() => page.evaluate(() => window.encryptionFinished)).toBe(true);
  await expect(page.locator("#input")).toHaveAttribute("type", "password");
  await expect(page.locator("#input")).toHaveJSProperty("readOnly", false);
  await expect(page.locator("#code")).toHaveText("");
  await expect(page.locator("#box")).not.toHaveClass(/done/);
});

test("encryption failures clear the secret and allow a fresh attempt", async ({ page }) => {
  await page.addInitScript(() => {
    const importKey = crypto.subtle.importKey.bind(crypto.subtle);
    let failOnce = true;
    crypto.subtle.importKey = (...args) => {
      if (failOnce) {
        failOnce = false;
        return Promise.reject(new DOMException("Test import failure", "DataError"));
      }
      return importKey(...args);
    };
  });
  await openGenerator(page);
  await enterSecret(page);
  await page.locator("#input").fill("oneot");
  await page.locator("#send").click();
  await expect(page.locator("#live")).toContainText("만들지 못했어요");
  await expect(page.locator("#input")).toHaveAttribute("type", "password");
  await expect(page.locator("#input")).toHaveValue("");
  await expect(page.locator("#send")).toBeDisabled();
  await generate(page);
  await expect(page.locator("#copy")).toBeFocused();
});

test("explains the secure-context requirement when Web Crypto is unavailable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "subtle", { value: undefined }));
  await openGenerator(page);
  await enterSecret(page);
  await page.locator("#input").fill("oneot");
  await page.locator("#send").click();
  await expect(page.locator("#live")).toContainText("HTTPS 또는 localhost");
  await expect(page.locator("#input")).toHaveAttribute("type", "password");
  await expect(page.locator("#input")).toHaveValue("");
});

test("copy success timers reset on a new copy and on restart", async ({ page }) => {
  await page.clock.install();
  await mockClipboard(page);
  await openGenerator(page);
  await generate(page);
  const copy = page.locator("#copy");
  await copy.click();
  await expect(copy).toHaveText("복사됨");
  await page.clock.fastForward(1500);
  await copy.click();
  await page.clock.fastForward(500);
  await expect(copy).toHaveText("복사됨");
  await page.clock.fastForward(1400);
  await expect(copy).toHaveText("복사");
  await copy.click();
  await page.locator("#again").click();
  await generate(page, "second-user");
  await page.clock.fastForward(2000);
  await expect(copy).toHaveText("복사");
  await expect(copy).not.toHaveClass(/ok|error/);
  const writes = await page.evaluate(() => window.clipboardCalls.writes);
  expect(writes).toHaveLength(3);
  expect(new Set(writes).size).toBe(1);
  expect(writes[0]).not.toContain(DUMMY_SECRET);
});

for (const primary of ["denied", "missing"]) {
  test(`uses the legacy clipboard only when it reports success (${primary})`, async ({ page }) => {
    await mockClipboard(page, primary);
    await openGenerator(page);
    await generate(page);
    await page.locator("#copy").click();
    await expect(page.locator("#copy")).toHaveText("복사됨");
    const fallback = await page.evaluate(() => window.clipboardCalls.fallbacks);
    expect(fallback).toEqual([{
      command: "copy", value: await page.locator("#code").textContent(),
      start: 0, end: (await page.locator("#code").textContent()).length
    }]);
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator("#copy")).toBeFocused();
  });
}

for (const fallback of ["false", "throw"]) {
  test(`shows a real copy failure and selects the code (${fallback})`, async ({ page }) => {
    await mockClipboard(page, "denied", fallback);
    await openGenerator(page);
    await generate(page);
    await page.locator("#copy").click();
    await expect(page.locator("#copy")).toHaveText("복사 실패");
    await expect(page.locator("#copy")).not.toHaveClass(/ok/);
    await expect(page.locator("#live")).toContainText("직접 복사");
    await expect(page.locator("#code")).toBeFocused();
    expect(await page.evaluate(() => window.getSelection().getRangeAt(0).cloneContents().textContent))
      .toBe(await page.locator("#code").textContent());
    await expect(page.locator("textarea")).toHaveCount(0);
    await page.locator("#again").click();
    await generate(page);
    await expect(page.locator("#copy")).toHaveText("복사");
    await expect(page.locator("#copy")).not.toHaveClass(/error/);
  });
}

for (const completion of ["resolve", "reject"]) {
  test(`ignores a stale clipboard ${completion} after restart`, async ({ page }) => {
    await mockClipboard(page, "pending");
    await openGenerator(page);
    await generate(page);
    const copy = page.locator("#copy");
    await copy.click();
    await expect(copy).toBeDisabled();
    await copy.dispatchEvent("click");
    expect(await page.evaluate(() => window.clipboardCalls.writes.length)).toBe(1);
    await page.locator("#again").click();
    await generate(page, "second-user");
    await copy.click();
    await page.evaluate(completion => {
      const pending = window.clipboardCalls.pending[0];
      pending[completion](new Error("Stale clipboard result"));
    }, completion);
    await expect(copy).toBeDisabled();
    await expect(copy).toHaveText("복사 중");
    expect(await page.evaluate(() => window.clipboardCalls.fallbacks)).toEqual([]);
    await page.evaluate(() => window.clipboardCalls.pending[1].resolve());
    await expect(copy).toHaveText("복사됨");
    await expect(copy).toBeEnabled();
  });
}

test("does not steal focus if the user moves while copying", async ({ page }) => {
  await mockClipboard(page, "pending");
  await openGenerator(page);
  await generate(page);
  await page.locator("#copy").click();
  await page.locator("#again").focus();
  await page.evaluate(() => window.clipboardCalls.pending[0].resolve());
  await expect(page.locator("#copy")).toHaveText("복사됨");
  await expect(page.locator("#again")).toBeFocused();
});

test("keeps the animated flow usable and cancels a restarted input transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGenerator(page);
  await page.locator("#input").fill(DUMMY_SECRET);
  await page.locator("#send").dispatchEvent("click");
  await expect(page.locator("#box")).toHaveAttribute("aria-busy", "true");
  await page.locator("#again").dispatchEvent("click");
  await expect(page.locator("#input")).toHaveAttribute("type", "password");
  await expect(page.locator("#input")).toHaveValue("");
  await generate(page);
  await page.locator("#again").click();
  await expect(page.locator("#input")).toBeFocused();
  await expect(page.locator("#code")).toHaveText("");
});
