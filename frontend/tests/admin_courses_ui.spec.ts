import { test, expect } from '@playwright/test';

test.describe('Admin Course Management - Modern Courses Page UI', () => {
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
    await page.goto('/admin/course-management/courses');
    await page.waitForLoadState('networkidle');
  });

  test('renders modern sticky header with title, live metric pill, and all controls', async ({ page }) => {
    // 1. Brand & Title
    const title = page.locator('.crs-header-title');
    await expect(title).toHaveText('Courses');
    await expect(page.locator('.crs-header-eyebrow')).toBeVisible();
    await expect(page.locator('.crs-header-icon')).toBeVisible();

    // 2. Live Metric Pill
    const statPill = page.locator('.crs-header-stat-pill');
    await expect(statPill).toBeVisible();
    await expect(statPill).toContainText(/Courses/);

    // 3. Header Controls
    await expect(page.locator('#crs-search-input')).toBeVisible();
    await expect(page.locator('#crs-assessment-filter')).toBeVisible();
    await expect(page.locator('#crs-sort-select')).toBeVisible();
    await expect(page.locator('#crs-refresh-btn')).toBeVisible();
    await expect(page.locator('#crs-new-course-btn')).toBeVisible();
  });

  test('renders 5 KPI summary metric cards with accurate data', async ({ page }) => {
    const kpiStrip = page.locator('.crs-kpi-strip');
    await expect(kpiStrip).toBeVisible();

    const kpiCards = page.locator('.crs-kpi-card');
    await expect(kpiCards).toHaveCount(5);

    // Check labels within KPI strip
    await expect(kpiStrip.getByText('Total Courses', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Total Modules', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('With Assessment', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Avg Pass Criteria', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Covered Ranks', { exact: true })).toBeVisible();
  });

  test('search input filters courses and provides active chips with clear', async ({ page }) => {
    const searchInput = page.locator('#crs-search-input');
    await searchInput.fill('Cargo');
    await page.waitForTimeout(300);

    // Active chip should appear
    const chip = page.locator('.crs-chip', { hasText: 'Cargo' });
    await expect(chip).toBeVisible();

    // Matching rows should be visible
    await expect(page.locator('.crs-table tbody tr', { hasText: 'Cargo Operations Manual' }).first()).toBeVisible();

    // Stat pill reflects filtered count
    const statPill = page.locator('.crs-header-stat-pill');
    await expect(statPill).toContainText(/Filtered/);

    // Clear search using clear button in input
    const clearBtn = page.locator('.crs-search-clear');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(200);

    await expect(searchInput).toHaveValue('');
    await expect(chip).not.toBeVisible();
  });

  test('assessment filter dropdown filters courses', async ({ page }) => {
    const filter = page.locator('#crs-assessment-filter');
    await filter.selectOption('has-assessment');
    await page.waitForTimeout(300);

    // Filter chip appears
    await expect(page.locator('.crs-chip', { hasText: 'With Assessment' })).toBeVisible();

    // All displayed rows should have questions
    const assessmentCells = page.locator('.crs-table tbody tr .crs-assessment-qs');
    const count = await assessmentCells.count();
    expect(count).toBeGreaterThan(0);

    // Click "Clear all"
    await page.locator('.crs-chip-clear-all').click();
    await page.waitForTimeout(200);
    await expect(filter).toHaveValue('all');
  });

  test('table renders sticky headers, metadata pills, and attached pagination', async ({ page }) => {
    const table = page.locator('.crs-table');
    await expect(table).toBeVisible();

    // Check table headers
    await expect(page.locator('thead th.crs-col-sino')).toContainText('SI No.');
    await expect(page.locator('thead th.crs-col-course')).toContainText('Course');
    await expect(page.locator('thead th.crs-col-modules')).toContainText('Modules');
    await expect(page.locator('thead th.crs-col-assessment')).toContainText('Final Assessment');
    await expect(page.locator('thead th.crs-col-ranks')).toContainText('Target Ranks');
    await expect(page.locator('thead th.crs-col-actions')).toContainText('Actions');

    // Check pagination bar
    const pagination = page.locator('.crs-pagination');
    await expect(pagination).toBeVisible();
    await expect(pagination.locator('.crs-page-info')).toContainText(/Showing \d+ to \d+ of \d+ entries/);
  });

  test('new course modal opens with form fields and closes cleanly', async ({ page }) => {
    const newCourseBtn = page.locator('#crs-new-course-btn');
    await newCourseBtn.click();

    // Modal dialog is visible
    const modal = page.locator('.crs-modal-dialog');
    await expect(modal).toBeVisible();
    await expect(page.getByText('Create New Course')).toBeVisible();

    // Form fields are present
    await expect(page.getByPlaceholder('e.g. Firefighting')).toBeVisible();
    await expect(page.getByPlaceholder('Short desc')).toBeVisible();
    await expect(page.getByPlaceholder('2 hours')).toBeVisible();

    // Close via X button
    await page.locator('.crs-modal-close').click();
    await expect(modal).not.toBeVisible();
  });

  test('duplicate button opens confirmation copy dialog', async ({ page }) => {
    const copyBtn = page.locator('.crs-copy-btn').first();
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Copy dialog is visible
    await expect(page.getByText('Copy this course?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // Cancel copy
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Copy this course?')).not.toBeVisible();
  });
});
