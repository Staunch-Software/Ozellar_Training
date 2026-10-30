import { test, expect } from '@playwright/test';

test.describe('Admin Course Management Report - Premium Header & Filters UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const adminTab = page.getByRole('tab', { name: 'Admin' });
    if (await adminTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await adminTab.click();
      await page.getByRole('textbox', { name: 'Email' }).fill('admin@ozellarmarine.com');
      await page.getByRole('textbox', { name: 'Password' }).fill('Admin@123');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/admin/);
    }
    await page.goto('/admin/course-management/report');
    await page.waitForLoadState('networkidle');
  });

  test('renders modern header with title, live metric pill, and export actions', async ({ page }) => {
    // 1. Brand & Title
    const title = page.locator('.rpt-header-title');
    await expect(title).toHaveText('Completion Report');
    await expect(page.locator('.rpt-header-eyebrow')).toBeVisible();
    await expect(page.locator('.rpt-header-icon')).toBeVisible();

    // 2. Live Metric Pill
    const statPill = page.locator('.rpt-header-stat-pill');
    await expect(statPill).toBeVisible();
    await expect(statPill).toContainText(/Seafarers/);

    // 3. Export & Refresh actions
    await expect(page.locator('#rpt-download-xlsx-btn')).toBeVisible();
    await expect(page.locator('#rpt-download-csv-btn')).toBeVisible();
    await expect(page.locator('#rpt-refresh-btn')).toBeVisible();
  });

  test('seafarer search input filters results and allows clearing via x button', async ({ page }) => {
    const searchInput = page.locator('#rpt-search-input');
    await expect(searchInput).toBeVisible();

    // Type a specific query
    await searchInput.fill('AADARSH');
    await page.waitForTimeout(300);

    // Verify active filter chip appears
    const chip = page.locator('#chip-crew-search');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('AADARSH');

    // Verify clear button appears in search box and clears input
    const clearBtn = page.locator('.rpt-search-clear');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
    await expect(chip).not.toBeVisible();
  });

  test('modern CardSelect course dropdown opens, selects a course, and displays active chip', async ({ page }) => {
    const courseSelectTrigger = page.locator('#rpt-course-filter');
    await expect(courseSelectTrigger).toBeVisible();
    await expect(courseSelectTrigger).toContainText('All Courses');

    // Click to open floating card panel
    await courseSelectTrigger.click();
    const panel = page.locator('.cardselect-panel');
    await expect(panel).toBeVisible();

    // Course search box inside CardSelect
    const panelSearch = page.locator('.cardselect-search-input');
    await expect(panelSearch).toBeVisible();

    // Select the second option (first individual course)
    const options = page.locator('.cardselect-option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(1);

    const targetOption = options.nth(1);
    const targetLabel = (await targetOption.locator('.cardselect-option-label').textContent()) || '';
    await targetOption.click();

    // Panel should close and trigger should show selected course
    await expect(panel).not.toBeVisible();
    await expect(courseSelectTrigger).toContainText(targetLabel);

    // Active filter chip should appear
    const courseChip = page.locator('#chip-course');
    await expect(courseChip).toBeVisible();
    await expect(courseChip).toContainText(targetLabel);

    // Remove chip via x button
    const removeChipBtn = courseChip.locator('.rpt-chip-remove');
    await removeChipBtn.click();
    await expect(courseChip).not.toBeVisible();
    await expect(courseSelectTrigger).toContainText('All Courses');
  });

  test('status CardSelect filters by status and Reset Filters button clears all active filters', async ({ page }) => {
    const statusTrigger = page.locator('#rpt-status-filter');
    await expect(statusTrigger).toBeVisible();
    await expect(statusTrigger).toContainText('All Statuses');

    // Open status dropdown and select Completed
    await statusTrigger.click();
    const completedOption = page.locator('.cardselect-option', { hasText: 'Completed' });
    await expect(completedOption).toBeVisible();
    await completedOption.click();

    // Check trigger and chip
    await expect(statusTrigger).toContainText('Completed');
    const statusChip = page.locator('#chip-status');
    await expect(statusChip).toBeVisible();
    await expect(statusChip).toContainText('Completed');

    // Also add search query
    await page.locator('#rpt-search-input').fill('TestQuery');
    await page.waitForTimeout(200);

    // Reset Filters button should be visible in header
    const resetBtn = page.locator('#rpt-reset-filters-btn');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // All filters should be cleared
    await expect(statusTrigger).toContainText('All Statuses');
    await expect(page.locator('#rpt-search-input')).toHaveValue('');
    await expect(resetBtn).not.toBeVisible();
    await expect(page.locator('.rpt-active-chips-row')).not.toBeVisible();
  });

  test('responsive mobile layout displays properly without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    // Verify header title and actions are visible
    await expect(page.locator('.rpt-header-title')).toBeVisible();
    await expect(page.locator('#rpt-download-xlsx-btn')).toBeVisible();

    // Verify search and card dropdowns are visible and stacked
    const searchBox = page.locator('.rpt-search-wrap');
    const courseBox = page.locator('.rpt-select-course');
    const statusBox = page.locator('.rpt-select-status');

    await expect(searchBox).toBeVisible();
    await expect(courseBox).toBeVisible();
    await expect(statusBox).toBeVisible();

    const searchRect = await searchBox.boundingBox();
    const courseRect = await courseBox.boundingBox();
    const statusRect = await statusBox.boundingBox();

    // Stacked vertically: courseBox y > searchBox y, statusBox y > courseBox y
    expect(courseRect!.y).toBeGreaterThan(searchRect!.y);
    expect(statusRect!.y).toBeGreaterThan(courseRect!.y);
  });
    test('at initial scroll (top: 0), top 4 course management cards and all 5 KPI cards are fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // Verify cm-header is visible
    const cmHeader = page.locator('.cm-header');
    await expect(cmHeader).toBeVisible();

    // Verify top 4 cards are visible
    const cmCards = page.locator('.cm-card');
    await expect(cmCards).toHaveCount(4);

    // Verify all 5 KPI cards are visible
    const kpiCards = page.locator('.rpt-kpi');
    await expect(kpiCards).toHaveCount(5);

    // Verify filter header is visible
    const headerContainer = page.locator('.rpt-header-container');
    await expect(headerContainer).toBeVisible();

    // Verify positions: cm-header at top, cmCards below, KPI strip below cmCards, filter header below KPI strip
    const cmHeaderRect = (await cmHeader.boundingBox())!;
    const cmCardsRect = (await page.locator('.cm-cards').boundingBox())!;
    const kpiStripRect = (await page.locator('.rpt-kpi-strip').boundingBox())!;
    const headerContainerRect = (await headerContainer.boundingBox())!;

    // Filter header is present at the top directly under cmCards, with KPI cards below it
    expect(cmCardsRect.y).toBeGreaterThanOrEqual(cmHeaderRect.y + cmHeaderRect.height - 2);
    expect(headerContainerRect.y).toBeGreaterThanOrEqual(cmCardsRect.y + cmCardsRect.height - 2);
    expect(kpiStripRect.y).toBeGreaterThanOrEqual(headerContainerRect.y + headerContainerRect.height - 2);
  });

  test('scrolling down hides top 4 cards and KPI cards while fixing filter header directly under cm-header', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    const cmWrapper = page.locator('.cm-wrapper');
    const cmHeader = page.locator('.cm-header');
    const cmCards = page.locator('.cm-cards');
    const kpiStrip = page.locator('.rpt-kpi-strip');
    const headerContainer = page.locator('.rpt-header-container');

    // Scroll down cm-wrapper by 200px
    await page.evaluate(() => {
      document.querySelector('.cm-wrapper')!.scrollTop = 200;
    });
    await page.waitForTimeout(300);

    const cmHeaderRect = (await cmHeader.boundingBox())!;
    const cmCardsRect = (await cmCards.boundingBox())!;
    const kpiStripRect = (await kpiStrip.boundingBox())!;
    const headerContainerRect = (await headerContainer.boundingBox())!;

    // 1. Top 4 cards are hidden behind cm-header, and KPI cards are hidden behind pinned filter header
    expect(cmCardsRect.y + cmCardsRect.height).toBeLessThanOrEqual(cmHeaderRect.y + cmHeaderRect.height + 2);
    expect(kpiStripRect.y + kpiStripRect.height).toBeLessThanOrEqual(headerContainerRect.y + headerContainerRect.height + 2);

    // 2. Filter header is pinned directly under cm-header
    expect(Math.abs(headerContainerRect.y - (cmHeaderRect.y + cmHeaderRect.height))).toBeLessThanOrEqual(2);

    // 3. Table has full vertical space and table rows scroll smoothly
    const tableScroll = page.locator('.rpt-table-scroll');
    await expect(tableScroll).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('.rpt-table-scroll')!.scrollTop = 300;
    });
    await page.waitForTimeout(200);
    const tableScrollTop = await page.evaluate(() => document.querySelector('.rpt-table-scroll')!.scrollTop);
    expect(tableScrollTop).toBeGreaterThanOrEqual(250);

    // 4. Scrolling cm-wrapper back to top restores cards and KPI strip
    await page.evaluate(() => {
      document.querySelector('.cm-wrapper')!.scrollTop = 0;
    });
    await page.waitForTimeout(300);

    const restoredCardsRect = (await cmCards.boundingBox())!;
    const restoredHeaderRect = (await headerContainer.boundingBox())!;
    const restoredKpiRect = (await kpiStrip.boundingBox())!;
    expect(restoredCardsRect.y).toBeGreaterThan(cmHeaderRect.y + cmHeaderRect.height - 2);
    expect(restoredHeaderRect.y).toBeGreaterThan(restoredCardsRect.y);
    expect(restoredKpiRect.y).toBeGreaterThan(restoredHeaderRect.y);
  });

  test('mouse wheel on table seamlessly drives outer cm-wrapper scroll until filter pins', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    const wheelResult = await page.evaluate(() => {
      const cmWrapper = document.querySelector('.cm-wrapper')!;
      const tableScroll = document.querySelector('.rpt-table-scroll')!;

      cmWrapper.scrollTop = 0;
      tableScroll.scrollTop = 0;

      // Dispatch wheel down 250px on table
      tableScroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 250, cancelable: true }));
      const afterDown = cmWrapper.scrollTop;

      // Dispatch wheel up 250px on table
      tableScroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -250, cancelable: true }));
      const afterUp = cmWrapper.scrollTop;

      return { afterDown, afterUp };
    });

    expect(wheelResult.afterDown).toBeGreaterThanOrEqual(180);
    expect(wheelResult.afterUp).toBe(0);
  });
  test('table header is sticky at top with solid background and pagination is compact and attached to bottom', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    const tableScroll = page.locator('.rpt-table-scroll');
    const th = page.locator('.rpt-table th').first();
    const pagination = page.locator('.rpt-pagination');
    const tableCard = page.locator('.rpt-table-card');

    // 1. Verify sticky table header CSS
    const thStyles = await th.evaluate(el => {
      const cs = window.getComputedStyle(el);
      return {
        position: cs.position,
        top: cs.top,
        zIndex: cs.zIndex,
        backgroundColor: cs.backgroundColor,
      };
    });
    expect(thStyles.position).toBe('sticky');
    expect(thStyles.top).toBe('0px');
    expect(parseInt(thStyles.zIndex, 10)).toBeGreaterThanOrEqual(10);

    // 2. Scroll table rows internally and verify th remains locked at top
    await page.evaluate(() => {
      document.querySelector('.rpt-table-scroll')!.scrollTop = 300;
    });
    await page.waitForTimeout(200);

    const stickyMetrics = await page.evaluate(() => {
      const scrollEl = document.querySelector('.rpt-table-scroll')!;
      const thEl = document.querySelector('.rpt-table th')!;
      return {
        scrollTop: scrollEl.scrollTop,
        thTopRelative: thEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top,
      };
    });
    expect(stickyMetrics.scrollTop).toBeGreaterThanOrEqual(250);
    expect(Math.abs(stickyMetrics.thTopRelative)).toBeLessThanOrEqual(2);

    // 3. Compact pagination height (38px, <= 42px)
    const pagHeight = await pagination.evaluate(el => el.getBoundingClientRect().height);
    expect(pagHeight).toBeLessThanOrEqual(42);
    expect(pagHeight).toBeGreaterThanOrEqual(36);

    // 4. When pinned, pagination is attached to bottom of table card and fully inside the viewport
    await page.evaluate(() => {
      document.querySelector('.cm-wrapper')!.scrollTop = 200;
    });
    await page.waitForTimeout(200);

    const pagAttachment = await page.evaluate(() => {
      const pag = document.querySelector('.rpt-pagination')!;
      const card = document.querySelector('.rpt-table-card')!;
      const pagRect = pag.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        bottomDiff: Math.abs(pagRect.bottom - cardRect.bottom),
        fullyInWindow: pagRect.bottom <= window.innerHeight,
        distFromWindowBottom: window.innerHeight - pagRect.bottom,
      };
    });
    expect(pagAttachment.bottomDiff).toBeLessThanOrEqual(2);
    expect(pagAttachment.fullyInWindow).toBe(true);
    expect(pagAttachment.distFromWindowBottom).toBeGreaterThan(0);
  });
});
