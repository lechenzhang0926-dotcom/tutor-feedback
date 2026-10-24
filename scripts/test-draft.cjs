// 验证："填写内容 + 切换页面后不丢失"
// 用真实浏览器走一遍：登录 → 进作业页 → 填链接 → 模拟切走再回来 → 检查内容还在
const { chromium } = require('C:\\Users\\33696\\Projects\\tutor-feedback\\node_modules\\playwright');
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\Users\\33696\\AppData\\Local\\ms-playwright';

const TEST_EMAIL = 'buddy-selftest@example.com';
const TEST_PASS = 'TestPass123!@#';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const log = (m) => console.log(m);

  try {
    // 1. 登录
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 });
    const hasLogin = await page.locator('input[type="email"]').count();
    if (hasLogin) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASS);
      await page.locator('button', { hasText: /^登录$/ }).first().click();
      await page.waitForTimeout(4000);
      log('LOGIN_DONE');
    } else {
      log('ALREADY_LOGGED_IN');
    }

    // 2. 打开"作业"标签
    await page.locator('button', { hasText: /^作业$/ }).first().click();
    await page.waitForTimeout(1500);

    // 3. 填入测试链接
    const testUrl = 'https://example.com/test-draft-' + Date.now();
    const firstTextInput = page.locator('.card input[type="text"]').first();
    await firstTextInput.fill(testUrl);
    await page.waitForTimeout(1200);
    log('FILLED=' + testUrl);

    // 4. 读出 localStorage 里的草稿
    const draft = await page.evaluate(() => localStorage.getItem('tutor_draft_homework'));
    log('DRAFT=' + (draft ? draft.slice(0, 300) : 'NULL'));

    // 5. 模拟"切到别的页面再回来"：先把标签页藏起来再显示，触发 visibilitychange
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(4000);

    // 6. 检查内容是否还在
    const valueAfter = await firstTextInput.inputValue();
    log('AFTER_VISIBILITY=' + valueAfter);
    log(valueAfter === testUrl ? 'RESULT=PASS_VISIBILITY' : 'RESULT=FAIL_VISIBILITY');

    // 7. 模拟整页重载（最坏情况）
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await page.locator('button', { hasText: /^作业$/ }).first().click();
    await page.waitForTimeout(2000);
    const valueAfterReload = await page.locator('.card input[type="text"]').first().inputValue();
    log('AFTER_RELOAD=' + valueAfterReload);
    log(valueAfterReload === testUrl ? 'RESULT=PASS_RELOAD' : 'RESULT=FAIL_RELOAD');

  } catch (e) {
    log('ERROR ' + (e && e.message ? e.message : String(e)));
  } finally {
    await browser.close();
  }
})();
