import { test, expect } from '@playwright/test';

test.describe('Admin Course Management - Assignments Page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const adminTab = page.locator('button, [role="tab"]').filter({ hasText: 'Admin' }).first();
    if (await adminTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await adminTab.click();
      await page.fill('input[type="email"], input[placeholder*="email" i]', 'admin@ozellarmarine.com');
      await page.fill('input[type="password"]', 'Admin@123');
      await page.click('button:has-text("Sign in"), button[type="submit"]');
      await expect(page).toHaveURL(/\/admin/);
    }
    await page.goto('/admin/course-management/assignments');
    await page.waitForLoadState('networkidle');
  });

  test('admin course assignment flow (original regression test)', async ({ page }) => {
    // Heading
    await expect(page.getByRole('heading', { name: /Assignments/i }).first()).toBeVisible();

    // Try to search for a crew member
    await page.locator('#asg-search-input').fill('Rajan');
    await page.waitForTimeout(300);

    // Wait for table to filter
    await expect(page.locator('tbody').getByText('Rajan').first()).toBeVisible();
  });

  test('renders modern sticky header with title, live metric pill, and all modern controls', async ({ page }) => {
    // 1. Brand & Title
    const title = page.locator('.asg-header-title');
    await expect(title).toHaveText('Assignments');
    await expect(page.locator('.asg-header-eyebrow')).toBeVisible();
    await expect(page.locator('.asg-header-icon')).toBeVisible();

    // 2. Live Metric Pill
    const statPill = page.locator('.asg-header-stat-pill');
    await expect(statPill).toBeVisible();
    await expect(statPill).toContainText(/Seafarers/);

    // 3. Header Controls
    await expect(page.locator('#asg-search-input')).toBeVisible();
    await expect(page.locator('#asg-rank-filter')).toBeVisible();
    await expect(page.locator('#asg-refresh-btn')).toBeVisible();
  });

  test('renders 5 unique light-themed compact KPI cards with badges', async ({ page }) => {
    const kpiCards = page.locator('.asg-kpi-card');
    await expect(kpiCards).toHaveCount(5);

    // 1. Crew (Amber)
    const card1 = page.locator('.asg-kpi-card--amber');
    await expect(card1).toBeVisible();
    await expect(card1.locator('.asg-kpi-badge')).toHaveText('Crew');
    await expect(card1.locator('.asg-kpi-lbl')).toHaveText('Total Seafarers');

    // 2. Curriculum (Indigo)
    const card2 = page.locator('.asg-kpi-card--indigo');
    await expect(card2).toBeVisible();
    await expect(card2.locator('.asg-kpi-badge')).toHaveText('Curriculum');
    await expect(card2.locator('.asg-kpi-lbl')).toHaveText('Active Courses');

    // 3. Enrollments (Emerald)
    const card3 = page.locator('.asg-kpi-card--emerald');
    await expect(card3).toBeVisible();
    await expect(card3.locator('.asg-kpi-badge')).toHaveText('Enrollments');
    await expect(card3.locator('.asg-kpi-lbl')).toHaveText('Assigned Slots');

    // 4. Ratio (Purple)
    const card4 = page.locator('.asg-kpi-card--purple');
    await expect(card4).toBeVisible();
    await expect(card4.locator('.asg-kpi-badge')).toHaveText('Ratio');
    await expect(card4.locator('.asg-kpi-lbl')).toHaveText('Avg / Seafarer');

    // 5. Completed (Sky)
    const card5 = page.locator('.asg-kpi-card--sky');
    await expect(card5).toBeVisible();
    await expect(card5.locator('.asg-kpi-badge')).toHaveText('Completed');
    await expect(card5.locator('.asg-kpi-lbl')).toHaveText('Completed Courses');
  });

  test('search and rank dropdown filters assignments using modern CardSelect', async ({ page }) => {
    // 1. Search
    const searchInput = page.locator('#asg-search-input');
    await searchInput.fill('Aadarsh');
    await page.waitForTimeout(300);

    // Active chip appears
    await expect(page.locator('.asg-chip', { hasText: 'Aadarsh' })).toBeVisible();
    await expect(page.locator('.admin-table tbody tr', { hasText: 'AADARSH' }).first()).toBeVisible();

    // Clear search
    await page.locator('.asg-search-clear').click();
    await page.waitForTimeout(200);
    await expect(searchInput).toHaveValue('');

    // 2. Rank filter using CardSelect
    const rankFilter = page.locator('#asg-rank-filter');
    await rankFilter.click();
    await page.waitForTimeout(300);

    const panel = page.locator('.asg-cardselect .cardselect-panel');
    await expect(panel).toBeVisible();

    // Select first non-all rank option
    const option = panel.locator('.cardselect-option').nth(1);
    const optionText = await option.locator('.cardselect-option-label').innerText();
    await option.click();
    await page.waitForTimeout(300);

    // Active chip appears
    await expect(page.locator('.asg-chip', { hasText: optionText })).toBeVisible();

    // Clear all
    await page.locator('.asg-chip-clear-all').click();
    await page.waitForTimeout(200);
    await expect(rankFilter).toContainText('All Ranks');
  });

  test('responsive layout adapts correctly across screen breakpoints', async ({ page }) => {
    // 1. Fullscreen / Ultrawide (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(200);
    await expect(page.locator('.asg-header-controls')).toBeVisible();
    await expect(page.locator('.asg-kpi-strip')).toBeVisible();

    // 2. Laptop (1200x800)
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    await expect(page.locator('.asg-header-controls')).toBeVisible();

    // 3. Tablet (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    await expect(page.locator('#asg-rank-filter')).toBeVisible();

    // 4. Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await expect(page.locator('#asg-search-input')).toBeVisible();
  });
});
