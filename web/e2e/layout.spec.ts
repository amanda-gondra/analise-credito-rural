/**
 * Every page at every size of the brief: no sideways scroll, the assistant button visible
 * inside the screen, and a full-page screenshot in test-results/visual for the visual review.
 */
import { expect, test } from "@playwright/test";

import { PAGES, VIEWPORTS, expectNoHorizontalScroll, waitForData } from "./support";

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.phone,
      hasTouch: viewport.phone,
      deviceScaleFactor: viewport.phone ? 2 : 1,
    });

    for (const target of PAGES) {
      test(`${target.name}`, async ({ page }) => {
        await page.goto(target.path);
        await waitForData(page);
        await expect(page.locator("h1")).toBeVisible();

        await expectNoHorizontalScroll(page);

        const launcher = page.getByRole("button", { name: /Assistente de Dados/ });
        await expect(launcher).toBeVisible();
        const box = await launcher.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44); // touch target

        await page.screenshot({ path: `test-results/visual/${target.name}-${viewport.name}.png`, fullPage: true });
      });
    }
  });
}
