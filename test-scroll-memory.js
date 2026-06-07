// Smoke-test for script position memory
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name + '.png') });
  console.log('  📸', name);
}

async function scrollTop(page) {
  return page.locator('.teleprompter').evaluate(el => el.scrollTop);
}

async function scrollRatio(page) {
  return page.locator('.teleprompter').evaluate(el => {
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? el.scrollTop / max : 0;
  });
}

const LONG_SCRIPT = Array.from({ length: 60 }, (_, i) =>
  `Line ${i + 1}: The quick brown fox jumps over the lazy dog. Filler text to make the script tall.`
).join('\n\n');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('  [page error]', m.text()); });

  // ── Shared setup ──────────────────────────────────────────
  async function loadFresh(url = 'http://localhost:5173') {
    await page.goto(url);
    await page.waitForSelector('.app');
    await page.evaluate(() => {
      localStorage.removeItem('tp_scroll_positions');
    });
    await page.waitForTimeout(300);
  }

  // ── 1. Position restored after script switch ──────────────
  console.log('\n=== 1. Scroll to 50%, switch to another script, return → restored ===');
  await loadFresh();

  // Fill the current script with long content
  await page.locator('textarea.script-editor').fill(LONG_SCRIPT);
  await page.waitForTimeout(1000); // wait for auto-save

  const preview = page.locator('.teleprompter');
  const maxScroll = await preview.evaluate(el => el.scrollHeight - el.clientHeight);
  const target50 = Math.round(maxScroll * 0.50);
  await preview.evaluate((el, top) => { el.scrollTop = top }, target50);
  await page.waitForTimeout(300);
  const scrollAt50 = await scrollTop(page);
  console.log(`  Set scrollTop to ${scrollAt50} (~50%)`);

  // Capture the active script title so we can click it by name later
  const activeTitle = await page.locator('.meta-title').innerText();
  console.log(`  Active script: "${activeTitle}"`);

  // Open library, create a second script → library items re-order
  await page.locator('button', { hasText: 'Scripts' }).click();
  await page.waitForTimeout(200);
  await page.locator('.lib-new').click();
  await page.waitForTimeout(500);

  // Click the original script by title
  await page.locator('.lib-item', { hasText: activeTitle }).click();
  await page.waitForTimeout(600); // allow RAF to apply restored scroll

  // Compare ratio, not absolute px — layout may shift when sidebar opens/closes
  const restoredRatio = await scrollRatio(page);
  const ratioDiff = Math.abs(restoredRatio - 0.5);
  if (ratioDiff <= 0.02) {
    console.log(`  ✅ Restored to ratio ${restoredRatio.toFixed(3)} (expected ~0.500)`);
  } else {
    console.log(`  ❌ Expected ratio ~0.500, got ${restoredRatio.toFixed(3)} (diff=${ratioDiff.toFixed(3)})`);
  }
  await shot(page, 'scroll-01-restored');

  // ── 2. tp_scroll_positions in localStorage ────────────────
  console.log('\n=== 2. Ratio stored in localStorage ===');
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('tp_scroll_positions');
    return raw ? JSON.parse(raw) : null;
  });
  if (stored && Object.values(stored).some(r => r > 0.4 && r < 0.6)) {
    console.log('  ✅ Stored ~50% ratio:', stored);
  } else {
    console.log('  ❌ Expected ~0.5 ratio, got:', stored);
  }

  // ── 3. Reset clears saved position ───────────────────────
  console.log('\n=== 3. Reset (⏮) clears saved position ===');
  await page.locator('button[title="Reset to top"]').click();
  await page.waitForTimeout(300);
  const afterReset = await scrollTop(page);
  console.log('  scrollTop after reset:', afterReset, afterReset === 0 ? '✅' : '❌');

  // Switch away and back — should start at top
  await page.locator('.lib-item').first().click(); // "Untitled Script"
  await page.waitForTimeout(300);
  await page.locator('.lib-item', { hasText: activeTitle }).click();
  await page.waitForTimeout(500);
  const afterResetReturn = await scrollTop(page);
  console.log('  After reset + switch back: scrollTop =', afterResetReturn, afterResetReturn === 0 ? '✅' : '❌');
  await shot(page, 'scroll-02-after-reset');

  // ── 4. Position persists across page reload ───────────────
  console.log('\n=== 4. Scroll to ~30%, reload → position restored ===');
  // Make sure we're on the long-content script
  await page.locator('.lib-item', { hasText: activeTitle }).click();
  await page.waitForTimeout(300);

  const maxScrollFresh = await preview.evaluate(el => el.scrollHeight - el.clientHeight);
  const target30 = Math.round(maxScrollFresh * 0.30);
  await preview.evaluate((el, top) => { el.scrollTop = top }, target30);
  await page.waitForTimeout(300);
  console.log(`  Scrolled to ${target30} (~30%)`);

  // Reload triggers beforeunload which saves the position
  await page.reload();
  await page.waitForSelector('.app');
  await page.waitForTimeout(600); // allow RAF restore

  // Compare ratio after reload — layout (sidebar) resets on fresh load
  const reloadRatio = await scrollRatio(page);
  const reloadRatioDiff = Math.abs(reloadRatio - 0.30);
  if (reloadRatioDiff <= 0.02) {
    console.log(`  ✅ After reload: ratio=${reloadRatio.toFixed(3)} (expected ~0.300)`);
  } else {
    console.log(`  ❌ After reload: expected ratio ~0.300, got ${reloadRatio.toFixed(3)}`);
  }
  await shot(page, 'scroll-03-after-reload');

  // ── 5. New scripts start at the top ──────────────────────
  console.log('\n=== 5. New script always starts at top ===');
  await page.locator('button', { hasText: 'Scripts' }).click();
  await page.waitForTimeout(200);
  await page.locator('.lib-new').click();
  await page.waitForTimeout(500);
  const newScriptTop = await page.locator('.teleprompter').evaluate(el => el.scrollTop);
  console.log('  New script scrollTop:', newScriptTop, newScriptTop === 0 ? '✅' : '❌');
  await shot(page, 'scroll-04-new-script-top');

  console.log('\n=== All tests complete ===\n');
  await browser.close();
})().catch(e => {
  console.error('\n💥 Test crashed:', e.message);
  process.exit(1);
});
