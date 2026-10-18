import { test, expect } from "@playwright/test";
import { enterSecret, openGenerator } from "./helpers.js";

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 }
]) {
  test(`glass layout: ${viewport.name}`, async ({ page }, testInfo) => {
    const capture = async (name, options = {}) => {
      const path = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ ...options, path });
      await testInfo.attach(name, { path, contentType: "image/png" });
    };
    await page.setViewportSize(viewport);
    await openGenerator(page);
    const box = page.locator("#box");
    const input = page.locator("#input");

    const initial = await box.boundingBox();
    expect(initial.width).toBe(Math.min(680, viewport.width - 32));
    expect(initial.height).toBe(viewport.width <= 480 ? 56 : 64);
    await expect(box).toHaveCSS("border-radius", "32px");
    await expect(box).toHaveCSS("backdrop-filter", "blur(24px) saturate(1.4)");
    await capture("password");

    await enterSecret(page);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await capture("github-id");

    await input.fill("oneot");
    await input.press("Enter");
    await expect(page.locator("#code")).toBeVisible();
    await expect(page.locator("#copy")).toBeFocused();
    await expect(box).toHaveCSS("border-radius", "28px");
    const result = await box.boundingBox();
    expect(result.width).toBe(initial.width);
    expect(result.height).toBeLessThanOrEqual(Math.min(640, viewport.height - 48));
    expect(result.x).toBeGreaterThanOrEqual(16);
    expect(result.y).toBeGreaterThanOrEqual(0);
    await capture("result");
    await capture("result-chrome", { style: "#code { color: transparent !important; }" });

    await page.locator("#again").click();
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toBeFocused();
    await expect(page.locator("#code")).toHaveText("");
    expect((await box.boundingBox()).height).toBe(initial.height);
  });
}
