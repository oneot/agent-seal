import { expect } from "@playwright/test";

export const DUMMY_SECRET = "dummy-secret-for-offline-tests-123456";

export async function openGenerator(page) {
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:4173") {
      return route.continue();
    }
    return route.abort();
  });
  await page.goto("./");
  await expect(page.locator("#input")).toBeFocused();
}

export async function enterSecret(page) {
  await page.locator("#input").fill(DUMMY_SECRET);
  await page.locator("#input").press("Enter");
  await expect(page.locator("#input")).toHaveAttribute("type", "text");
}

export async function generate(page, id = "oneot") {
  await enterSecret(page);
  await page.locator("#input").fill(id);
  await page.locator("#input").press("Enter");
  await expect(page.locator("#code")).toBeVisible();
  await expect(page.locator("#code")).toContainText("<!DOCTYPE html>");
}
