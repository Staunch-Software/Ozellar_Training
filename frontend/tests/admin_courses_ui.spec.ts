import { test, expect } from '@playwright/test';

test.describe('Admin Course Management - Modern Courses Page UI', () => {
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
    await page.goto('/admin/course-management/courses');
    await page.waitForLoadState('networkidle');
  });

  test('renders modern sticky header with title, live metric pill, and modern controls', async ({ page }) => {
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
    await expect(page.locator('#crs-course-filter')).toBeVisible();
    await expect(page.locator('#crs-assessment-filter')).toBeVisible();
    await expect(page.locator('#crs-refresh-btn')).toBeVisible();
    await expect(page.locator('#crs-new-course-btn')).toBeVisible();

    // 4. Verify sort select is removed
    await expect(page.locator('#crs-sort-select')).not.toBeVisible();
  });

  test('renders 5 unique light-themed compact KPI cards with badges', async ({ page }) => {
    const kpiStrip = page.locator('.crs-kpi-strip');
    await expect(kpiStrip).toBeVisible();

    const kpiCards = page.locator('.crs-kpi-card');
    await expect(kpiCards).toHaveCount(5);

    // Verify 5 distinct theme classes
    await expect(page.locator('.crs-kpi-card--indigo')).toBeVisible();
    await expect(page.locator('.crs-kpi-card--emerald')).toBeVisible();
    await expect(page.locator('.crs-kpi-card--purple')).toBeVisible();
    await expect(page.locator('.crs-kpi-card--amber')).toBeVisible();
    await expect(page.locator('.crs-kpi-card--sky')).toBeVisible();

    // Verify category badges
    await expect(kpiStrip.getByText('Curriculum', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Modules', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Assessment', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Benchmark', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Fleet Reach', { exact: true })).toBeVisible();

    // Verify labels
    await expect(kpiStrip.getByText('Total Courses', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Total Modules', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('With Assessment', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Avg Pass Criteria', { exact: true })).toBeVisible();
    await expect(kpiStrip.getByText('Covered Ranks', { exact: true })).toBeVisible();
  });

  test('course dropdown supports multi-select without checkbox elements and filters table', async ({ page }) => {
    const courseFilter = page.locator('#crs-course-filter');
    await expect(courseFilter).toBeVisible();
    await courseFilter.click();
    await page.waitForTimeout(300);

    // Dropdown panel is open and has search input
    const panel = page.locator('.crs-cardselect--course .cardselect-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.cardselect-search-input')).toBeVisible();

    // Confirm NO checkbox boxes are used for multi-select
    await expect(panel.locator('.cardselect-multi-check')).toHaveCount(0);
    await expect(panel.locator('input[type="checkbox"]')).toHaveCount(0);

    // Select the first 2 courses
    const options = panel.locator('.cardselect-option');
    const firstOptionLabel = (await options.nth(0).locator('.cardselect-option-label').innerText()).trim();
    const secondOptionLabel = (await options.nth(1).locator('.cardselect-option-label').innerText()).trim();

    await options.nth(0).click();
    await page.waitForTimeout(200);
    await options.nth(1).click();
    await page.waitForTimeout(200);

    // Verify active class and checkmark icons appear on selected options
    await expect(options.nth(0)).toHaveClass(/cardselect-option--active/);
    await expect(options.nth(1)).toHaveClass(/cardselect-option--active/);
    await expect(options.nth(0).locator('.cardselect-option-check')).toBeVisible();
    await expect(options.nth(1).locator('.cardselect-option-check')).toBeVisible();

    // Trigger shows "2 Selected" and count badge
    await expect(courseFilter).toContainText('2 Selected');
    await expect(courseFilter.locator('.cardselect-count-badge')).toHaveText('2');

    // Close panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Active filter chip appears
    const chip = page.locator('.crs-chip', { hasText: 'Courses: 2 selected' });
    await expect(chip).toBeVisible();

    // Table rows reflect selected courses
    const tableRows = page.locator('.crs-table tbody tr');
    await expect(tableRows).toHaveCount(2);
    await expect(page.locator('.crs-table', { hasText: firstOptionLabel })).toBeVisible();
    await expect(page.locator('.crs-table', { hasText: secondOptionLabel })).toBeVisible();

    // Clear filter via chip remove button
    await chip.locator('.crs-chip-remove').click();
    await page.waitForTimeout(200);
    await expect(courseFilter).toContainText('All Courses');
    await expect(tableRows.count()).resolves.toBeGreaterThan(2);
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

  test('assessment filter dropdown filters courses using modern CardSelect', async ({ page }) => {
    const filterTrigger = page.locator('#crs-assessment-filter');
    await filterTrigger.click();
    await page.waitForTimeout(300);

    // CardSelect panel opens
    const panel = page.locator('.crs-cardselect--assessment .cardselect-panel');
    await expect(panel).toBeVisible();

    // Select "With Assessment" option
    await panel.locator('.cardselect-option', { hasText: 'With Assessment' }).click();
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
    await expect(filterTrigger).toContainText('All Assessments');
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

  test('responsive layout adapts correctly across screen breakpoints', async ({ page }) => {
    // 1. Fullscreen / Ultrawide (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(200);
    const kpiStrip = page.locator('.crs-kpi-strip');
    await expect(kpiStrip).toBeVisible();
    await expect(page.locator('.crs-header-controls')).toBeVisible();

    // 2. Laptop (1200x800)
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    await expect(kpiStrip).toBeVisible();

    // 3. Tablet (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    await expect(page.locator('#crs-course-filter')).toBeVisible();
    await expect(page.locator('#crs-assessment-filter')).toBeVisible();

    // 4. Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await expect(page.locator('#crs-search-input')).toBeVisible();
    await expect(page.locator('#crs-new-course-btn')).toBeVisible();
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
