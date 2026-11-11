import { test, expect } from '@playwright/test';

test.describe('Admin Course Management - Modern Seafarers Page UI', () => {
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
    await page.goto('/admin/course-management/users');
    await page.locator('.usr-header-title').waitFor({ state: 'visible', timeout: 15000 });
  });

  test('renders sticky header with title, live metric pill, and all modern controls', async ({ page }) => {
    // 1. Brand & Title
    const title = page.locator('.usr-header-title');
    await expect(title).toHaveText('Seafarers');
    await expect(page.locator('.usr-header-eyebrow')).toBeVisible();
    await expect(page.locator('.usr-header-icon')).toBeVisible();

    // 2. Live Metric Pill
    const statPill = page.locator('.usr-header-stat-pill');
    await expect(statPill).toBeVisible();
    await expect(statPill).toContainText(/Seafarers/);

    // 3. Header Controls
    await expect(page.locator('#usr-search-input')).toBeVisible();
    await expect(page.locator('#usr-rank-filter')).toBeVisible();
    await expect(page.locator('#usr-status-filter')).toBeVisible();
    await expect(page.locator('#usr-refresh-btn')).toBeVisible();
    await expect(page.locator('#usr-new-btn')).toBeVisible();

    // 4. Verify NO KPI cards exist on this page
    await expect(page.locator('.crs-kpi-strip')).toHaveCount(0);
    await expect(page.locator('.usr-kpi-strip')).toHaveCount(0);
  });

  test('search filters seafarers by name, ID, or rank with active chip and clear', async ({ page }) => {
    const searchInput = page.locator('#usr-search-input');
    await searchInput.fill('Aadarsh');
    await page.waitForTimeout(300);

    // Active chip appears
    const chip = page.locator('.usr-chip', { hasText: 'Aadarsh' });
    await expect(chip).toBeVisible();

    // Matching rows visible
    await expect(page.locator('.usr-table tbody tr', { hasText: 'AADARSH' }).first()).toBeVisible();

    // Stat pill reflects filtered count
    const statPill = page.locator('.usr-header-stat-pill');
    await expect(statPill).toContainText(/Filtered/);

    // Clear search
    const clearBtn = page.locator('.usr-search-clear');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(200);

    await expect(searchInput).toHaveValue('');
    await expect(chip).not.toBeVisible();
  });

  test('rank dropdown filters seafarers using modern CardSelect', async ({ page }) => {
    const rankFilter = page.locator('#usr-rank-filter');
    await rankFilter.click();
    await page.waitForTimeout(300);

    // CardSelect panel is open
    const panel = page.locator('.usr-cardselect--rank .cardselect-panel');
    await expect(panel).toBeVisible();

    // Select "ABLE BODIED SEAMEN"
    const option = panel.locator('.cardselect-option', { hasText: 'ABLE BODIED SEAMEN' });
    await expect(option).toBeVisible();
    await option.click();
    await page.waitForTimeout(300);

    // Active chip appears
    await expect(page.locator('.usr-chip', { hasText: 'ABLE BODIED SEAMEN' })).toBeVisible();

    // All rows should have ABLE BODIED SEAMEN
    const rankCells = page.locator('.usr-table tbody tr .usr-col-rank');
    const firstCell = rankCells.first();
    await expect(firstCell).toContainText('ABLE BODIED SEAMEN');

    // Click "Clear all"
    await page.locator('.usr-chip-clear-all').click();
    await page.waitForTimeout(200);
    await expect(rankFilter).toContainText('All Ranks');
  });

  test('status dropdown filters seafarers by Active/Inactive', async ({ page }) => {
    const statusFilter = page.locator('#usr-status-filter');
    await statusFilter.click();
    await page.waitForTimeout(300);

    const panel = page.locator('.usr-cardselect--status .cardselect-panel');
    await expect(panel).toBeVisible();

    // Select Active
    await panel.locator('.cardselect-option', { hasText: 'Active' }).first().click();
    await page.waitForTimeout(300);

    // Active chip appears
    await expect(page.locator('.usr-chip', { hasText: 'Active' })).toBeVisible();

    // Reset via clear all
    await page.locator('.usr-chip-clear-all').click();
    await page.waitForTimeout(200);
    await expect(statusFilter).toContainText('All Statuses');
  });

  test('table renders sticky headers, seafarer avatars, progress bars, and compact pinned pagination', async ({ page }) => {
    const table = page.locator('.usr-table');
    await expect(table).toBeVisible();

    // Headers
    await expect(page.locator('thead th.usr-col-sino')).toContainText('SI No.');
    await expect(page.locator('thead th.usr-col-seafarer')).toContainText('Seafarer');
    await expect(page.locator('thead th.usr-col-role')).toContainText('Role');
    await expect(page.locator('thead th.usr-col-id')).toContainText('Seafarer ID');
    await expect(page.locator('thead th.usr-col-rank')).toContainText('Rank');
    await expect(page.locator('thead th.usr-col-phone')).toContainText('Mobile No');
    await expect(page.locator('thead th.usr-col-courses')).toContainText('Courses');
    await expect(page.locator('thead th.usr-col-status')).toContainText('Status');
    await expect(page.locator('thead th.usr-col-actions')).toContainText('Actions');

    // Sticky header check
    const th = page.locator('.usr-table thead th').first();
    const thPosition = await th.evaluate(el => window.getComputedStyle(el).position);
    expect(thPosition).toBe('sticky');

    // Rows have avatar initials
    await expect(page.locator('.usr-avatar').first()).toBeVisible();

    // Progress bar
    await expect(page.locator('.usr-progress-bar').first()).toBeVisible();

    // Pagination bar attached at bottom
    const pagination = page.locator('.usr-pagination');
    await expect(pagination).toBeVisible();
    await expect(pagination.locator('.usr-page-info')).toContainText(/Showing \d+ to \d+ of \d+ entries/);
  });

  test('add seafarer modal is learner-only without admin creation, modern UI, and closes cleanly', async ({ page }) => {
    const addBtn = page.locator('#usr-new-btn');
    await addBtn.click();

    // Modal dialog is visible
    const modal = page.locator('.usr-modal-dialog');
    await expect(modal).toBeVisible();
    await expect(page.locator('.usr-modal-title')).toHaveText('Add New Seafarer');
    await expect(page.locator('.usr-modal-sub')).toContainText('Register a crew member');

    // VERIFY: Administrator creation is COMPLETELY REMOVED from this page
    await expect(page.getByRole('button', { name: 'Administrator' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Seafarer (Learner)' })).toHaveCount(0);
    await expect(page.locator('#usr-form-password')).toHaveCount(0);

    // VERIFY: Crew authentication notice is present
    await expect(page.locator('.usr-modal-notice')).toBeVisible();
    await expect(page.locator('.usr-modal-notice')).toContainText('Seafarer ID');
    await expect(page.locator('.usr-modal-notice')).toContainText('Date of Birth');

    // VERIFY: Seafarer input fields are cleanly rendered (including email for reminders)
    await expect(page.locator('#usr-form-name')).toBeVisible();
    await expect(page.locator('#usr-form-rank')).toBeVisible();
    await expect(page.locator('#usr-form-crewid')).toBeVisible();
    await expect(page.locator('#usr-form-dob')).toBeVisible();
    await expect(page.locator('#usr-form-ppno')).toBeVisible();
    await expect(page.locator('#usr-form-mobile')).toBeVisible();
    await expect(page.locator('#usr-form-email')).toBeVisible();

    // VERIFY: Submit button is "Register Seafarer"
    const submitBtn = page.locator('#usr-form-submit');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Register Seafarer');

    // Close via Cancel button
    await page.locator('.usr-btn-cancel').click();
    await expect(modal).not.toBeVisible();
  });

  test('responsive layout adapts correctly across screen breakpoints', async ({ page }) => {
    // 1. Fullscreen / Ultrawide (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(200);
    await expect(page.locator('.usr-header-controls')).toBeVisible();
    await expect(page.locator('.usr-table')).toBeVisible();

    // 2. Laptop (1200x800)
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    await expect(page.locator('.usr-header-controls')).toBeVisible();

    // 3. Tablet (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    await expect(page.locator('#usr-rank-filter')).toBeVisible();
    await expect(page.locator('#usr-status-filter')).toBeVisible();

    // 4. Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await expect(page.locator('#usr-search-input')).toBeVisible();
    await expect(page.locator('#usr-new-btn')).toBeVisible();
  });
});
