import { test, expect } from '@playwright/test'

test.describe('Admin Orientation - Dedicated Approver-Style Review Page & File Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/admin')) return

    // Login as Admin
    const adminTab = page.getByRole('tab', { name: 'Admin' })
    if (await adminTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await adminTab.click({ force: true })
      await page.fill('#email', 'admin@ozellarmarine.com')
      await page.fill('#pw', 'Admin@123')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/admin/, { timeout: 10000 })
    }
  })

  test('orientation enrollments table review button navigates to dedicated review page', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    // Find and click the Review button
    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await expect(reviewBtn).toBeVisible({ timeout: 10000 })
    await reviewBtn.click()

    // Must navigate to the dedicated review page
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Approver-style review page container
    const pageContainer = page.locator('.orp-container')
    await expect(pageContainer).toBeVisible({ timeout: 8000 })

    // Header elements
    await expect(page.locator('.orp-back-btn')).toBeVisible()
    await expect(page.locator('.orp-candidate-name')).toBeVisible()
    await expect(page.locator('.orp-status-pill')).toBeVisible()
  })

  test('review page renders Approver-style stepper track and 70% height review card', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Stepper track
    const stepper = page.locator('.orp-stepper-left')
    await expect(stepper).toBeVisible({ timeout: 8000 })
    const pips = page.locator('.orp-stepper-pip')
    const pipCount = await pips.count()
    expect(pipCount).toBeGreaterThan(0)

    // 70% height place: Review Card
    const reviewCard = page.locator('.orp-review-card')
    await expect(reviewCard).toBeVisible()
    await expect(reviewCard.locator('.orp-task-title')).toBeVisible()

    // Position nav
    await expect(page.locator('.orp-step-counter')).toContainText(/Task 1 of/i)
  })

  test('stepper navigation and next/prev buttons update the task card', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Click Next button
    const nextBtn = page.locator('.orp-step-btn').nth(1)
    if (await nextBtn.isEnabled()) {
      await nextBtn.click()
      await expect(page.locator('.orp-step-counter')).toContainText(/Task 2 of/i)
    }

    // Click a pip directly
    const pips = page.locator('.orp-stepper-pip')
    if (await pips.count() >= 2) {
      await pips.nth(1).click()
      await expect(page.locator('.orp-step-counter')).toContainText(/Task 2 of/i)
    }
  })

  test('custom premium jump dropdown opens menu and switches active task', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Find and click the custom premium jump trigger
    const jumpTrigger = page.locator('.orp-jump-trigger')
    await expect(jumpTrigger).toBeVisible()
    await jumpTrigger.click()

    // Menu should open with options
    const menu = page.locator('.orp-jump-menu')
    await expect(menu).toBeVisible()

    const menuItems = menu.locator('.orp-jump-menu-item')
    const count = await menuItems.count()
    expect(count).toBeGreaterThan(0)

    if (count >= 2) {
      await menuItems.nth(1).click()
      await expect(menu).not.toBeVisible()
      await expect(page.locator('.orp-step-counter')).toContainText(/Task 2 of/i)
    }
  })

  test('evidence cards inside review card open FilePreviewModal with universal format support and next/prev carousel navigation', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    const evidenceCards = page.locator('.orp-evidence-card')
    const count = await evidenceCards.count()
    if (count > 0) {
      await evidenceCards.first().click()

      // FilePreviewModal should open
      const fileModal = page.locator('.fpm-container')
      await expect(fileModal).toBeVisible({ timeout: 6000 })
      await expect(fileModal.locator('.fpm-kind-badge')).toBeVisible()
      await expect(fileModal.locator('.fpm-title')).toBeVisible()

      // When multiple attachments exist, verify next/prev carousel controls & strip
      if (count > 1) {
        const carouselNav = fileModal.locator('.fpm-carousel-nav')
        await expect(carouselNav).toBeVisible()
        await expect(fileModal.locator('.fpm-nav-counter')).toContainText(/1 \/ /)

        // Floating edge next button
        const nextEdgeBtn = fileModal.locator('.fpm-floating-edge--next')
        await expect(nextEdgeBtn).toBeVisible()
        await nextEdgeBtn.click()

        // Counter updates to 2
        await expect(fileModal.locator('.fpm-nav-counter')).toContainText(/2 \/ /)

        // Bottom strip tabs exist and can switch back
        const stripTabs = fileModal.locator('.fpm-strip-tab')
        await expect(stripTabs).toHaveCount(count)
        await stripTabs.first().click()
        await expect(fileModal.locator('.fpm-nav-counter')).toContainText(/1 \/ /)

        // Keyboard navigation (ArrowRight and ArrowLeft)
        await page.keyboard.press('ArrowRight')
        await expect(fileModal.locator('.fpm-nav-counter')).toContainText(/2 \/ /)
        await page.keyboard.press('ArrowLeft')
        await expect(fileModal.locator('.fpm-nav-counter')).toContainText(/1 \/ /)
      }

      // Close modal
      await fileModal.locator('.fpm-close-btn').click()
      await expect(fileModal).not.toBeVisible()
    }
  })

  test('results page review button navigates to dedicated review page', async ({ page }) => {
    await page.goto('/admin/orientation-program/results')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    if (await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reviewBtn.click()
      await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)
      await expect(page.locator('.orp-container')).toBeVisible()
    }
  })

  test('enrollments table renders Review button without inline quick actions, navigating to dedicated review page', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    // Find the Review button
    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await expect(reviewBtn).toBeVisible({ timeout: 8000 })

    // Verify there are no inline quick-approve or quick-reject buttons on the table row
    const quickApproveBtns = page.locator('button[title="Quick Final Approve"]')
    await expect(quickApproveBtns).toHaveCount(0)
    const quickRejectBtns = page.locator('button[title="Quick Reject"]')
    await expect(quickRejectBtns).toHaveCount(0)

    // Click Review to go inside the dedicated review page
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Inside review page: verify action footer exists
    const footerActions = page.locator('.orp-footer-actions')
    await expect(footerActions).toBeVisible({ timeout: 8000 })
  })

  test('admin can approve and verify orientation task directly on review card', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Check task verification bar exists on review card
    const verifyBar = page.locator('.orp-task-verify-bar')
    await expect(verifyBar).toBeVisible({ timeout: 8000 })

    // Check if task has Approve Task button or is already verified
    const approveTaskBtn = verifyBar.locator('.orp-task-btn--approve, .orp-task-btn--subtle-approve').first()
    if (await approveTaskBtn.isVisible().catch(() => false)) {
      await approveTaskBtn.click()
      // Banner updates to verified
      await expect(verifyBar.locator('.orp-master-banner--verified')).toBeVisible({ timeout: 5000 })
    } else {
      // It's already verified, banner is visible
      await expect(verifyBar.locator('.orp-master-banner--verified')).toBeVisible()
    }
  })

  test('admin reject task opens simplified rejection modal with validation and type-and-reject flow', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    const verifyBar = page.locator('.orp-task-verify-bar')
    await expect(verifyBar).toBeVisible({ timeout: 8000 })

    // Find Reject or Subtle Reject button on the task
    const rejectTaskBtn = verifyBar.locator('.orp-task-btn--reject, .orp-task-btn--subtle-reject').first()
    if (await rejectTaskBtn.isVisible().catch(() => false)) {
      await rejectTaskBtn.click()

      // Simplified modal opens
      const modal = page.locator('.orp-reject-modal')
      await expect(modal).toBeVisible({ timeout: 5000 })
      await expect(modal.locator('.orp-reject-modal-title')).toContainText(/Reject Task #/i)

      // Textarea exists
      const textarea = modal.locator('.orp-reject-textarea')
      await expect(textarea).toBeVisible()

      // Clear textarea and try to submit empty to verify validation
      await textarea.fill('')
      await modal.locator('.orp-reject-btn-submit').click()
      await expect(modal.locator('.orp-reject-error-msg')).toBeVisible()

      // Type a remark
      await textarea.fill('Please upload signed checklist with vessel seal.')
      expect(await textarea.inputValue()).toBe('Please upload signed checklist with vessel seal.')

      // Cancel modal
      await modal.locator('.orp-reject-btn-cancel').click()
      await expect(modal).not.toBeVisible()
    }
  })

  test('final approve button requires all tasks approved and locks rejections when approved', async ({ page }) => {
    await page.goto('/admin/orientation-program/enrollments')
    await page.waitForLoadState('networkidle')

    const reviewBtn = page.locator('button').filter({ hasText: /Review/i }).first()
    await reviewBtn.click()
    await expect(page).toHaveURL(/\/admin\/orientation(\/|-)?review\//)

    // Check footer final approve button
    const approveBtn = page.locator('.orp-action-btn--approve')
    const fullyApprovedBanner = page.locator('.orp-decided-hint--approved')

    if (await approveBtn.isVisible().catch(() => false)) {
      // If visible, check disabled state if any tasks not approved
      const pips = page.locator('.orp-stepper-pip')
      const pipCount = await pips.count()
      // If final approve is enabled, all tasks must be verified
      const isDisabled = await approveBtn.isDisabled()
      if (isDisabled) {
        // Disabled title / tooltip should indicate tasks need approval
        const titleAttr = await approveBtn.getAttribute('title')
        expect(titleAttr).toContain('Approve all tasks')
      }
    } else if (await fullyApprovedBanner.isVisible().catch(() => false)) {
      // If already fully approved, no reject button should be shown
      const rejectBtns = page.locator('.orp-action-btn--reject, .orp-task-btn--reject, .orp-task-btn--subtle-reject')
      await expect(rejectBtns).toHaveCount(0)
    }
  })
})
