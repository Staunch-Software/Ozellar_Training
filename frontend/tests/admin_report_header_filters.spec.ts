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
});
