// Smoke-test for cue marker feature
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page, name) {
  const p = path.join(SCREENSHOT_DIR, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  console.log('  📸', name);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctx    = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page   = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') console.error('  [page error]', m.text()); });

  console.log('\n=== 1. Load app ===');
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  await shot(page, '01-initial');

  // ── 2. Paste a script with 3 cue markers ──────────────────
  console.log('\n=== 2. Paste script with [CUE] markers ===');
  const scriptWithCues = [
    'Opening section. This is the first part of the script.',
    'Keep reading here for a moment before the first cue.',
    '',
    '[CUE]',
    '',
    'Section two begins after the first cue marker.',
    'More text in this section to give it some body.',
    '',
    '[CUE]',
    '',
    'Third section. Almost at the end now.',
    'Final lines of the third section.',
    '',
    '[CUE]',
    '',
    'Final section. This is the last part of the script.',
  ].join('\n');

  const textarea = page.locator('textarea.script-editor');
  await textarea.fill(scriptWithCues);
  await page.waitForTimeout(600);
  await shot(page, '02-script-with-cues');

  // ── 3. Check that cue badges appear in the preview ────────
  console.log('\n=== 3. Verify [CUE] badges render in preview ===');
  const cueBadges = page.locator('.tp-cue');
  const cueCount = await cueBadges.count();
  if (cueCount === 3) {
    console.log('  ✅ 3 tp-cue badges rendered');
  } else {
    console.log(`  ❌ expected 3 badges, found ${cueCount}`);
  }

  // ── 4. Verify badge text ────────────────────────────────────
  const firstBadgeText = await cueBadges.first().innerText();
  if (firstBadgeText.includes('CUE')) {
    console.log('  ✅ badge text correct:', JSON.stringify(firstBadgeText));
  } else {
    console.log('  ❌ unexpected badge text:', JSON.stringify(firstBadgeText));
  }
  await shot(page, '03-cue-badges-preview');

  // ── 5. Check cue buttons appear in transport group ─────────
  console.log('\n=== 4. Verify ◀ Cue / Cue ▶ buttons in transport ===');
  const prevCueBtn = page.locator('button', { hasText: 'Cue' }).first();
  const nextCueBtn = page.locator('button', { hasText: 'Cue ▶' }).first();
  const prevVisible = await prevCueBtn.isVisible();
  const nextVisible = await nextCueBtn.isVisible();
  console.log('  ◀ Cue button visible:', prevVisible ? '✅' : '❌');
  console.log('  Cue ▶ button visible:', nextVisible ? '✅' : '❌');

  // ── 6. Open Operator Dashboard and check cue section ───────
  console.log('\n=== 5. Open Operator Dashboard — check cue section ===');
  await page.locator('button', { hasText: 'Dashboard' }).click();
  await page.waitForTimeout(400);
  const cueLabel = page.locator('.op-cue-label');
  const cueLabelVisible = await cueLabel.isVisible();
  const cueLabelText   = cueLabelVisible ? await cueLabel.innerText() : '';
  console.log('  Cue section visible:', cueLabelVisible ? '✅' : '❌');
  if (cueLabelText) console.log('  Label text:', JSON.stringify(cueLabelText));
  await shot(page, '04-dashboard-cue-section');

  // ── 7. Test "Next ▶" button in dashboard ───────────────────
  console.log('\n=== 6. Jump to next cue via Dashboard button ===');
  const preview = page.locator('.teleprompter');
  const scrollBefore = await preview.evaluate(el => el.scrollTop);
  const nextDashBtn = page.locator('.op-cue-btns button', { hasText: 'Next' });
  await nextDashBtn.click();
  await page.waitForTimeout(300);
  const scrollAfter = await preview.evaluate(el => el.scrollTop);
  if (scrollAfter > scrollBefore) {
    console.log(`  ✅ scrollTop moved ${scrollBefore} → ${scrollAfter}`);
  } else {
    console.log(`  ❌ scrollTop did not change (${scrollBefore} → ${scrollAfter})`);
  }
  await shot(page, '05-after-next-cue');

  // ── 8. Test ◀ Prev button — at cue 1, no prev exists → no-op ─
  console.log('\n=== 7. Prev from first cue → no-op (expected) ===');
  const prevDashBtn = page.locator('.op-cue-btns button', { hasText: 'Prev' });
  await prevDashBtn.click();
  await page.waitForTimeout(300);
  const scrollAfterNoOp = await preview.evaluate(el => el.scrollTop);
  if (scrollAfterNoOp === scrollAfter) {
    console.log(`  ✅ scrollTop unchanged at ${scrollAfterNoOp} (correct: no cue before cue 1)`);
  } else {
    console.log(`  ❌ unexpected scroll change: ${scrollAfter} → ${scrollAfterNoOp}`);
  }

  // Now jump to cue 2, then verify prev goes back to cue 1
  const nextDashBtn2 = page.locator('.op-cue-btns button', { hasText: 'Next' });
  await nextDashBtn2.click();
  await page.waitForTimeout(300);
  const scrollAtCue2 = await preview.evaluate(el => el.scrollTop);
  await prevDashBtn.click();
  await page.waitForTimeout(300);
  const scrollBack = await preview.evaluate(el => el.scrollTop);
  if (scrollBack < scrollAtCue2) {
    console.log(`  ✅ prev from cue 2 moved back: ${scrollAtCue2} → ${scrollBack}`);
  } else {
    console.log(`  ❌ prev from cue 2 did not move back (${scrollAtCue2} → ${scrollBack})`);
  }
  await shot(page, '06-after-prev-cue');

  // ── 9. Test keyboard shortcuts [ and ] ─────────────────────
  console.log('\n=== 8. Keyboard shortcuts [ and ] ===');
  // Click the preview panel to ensure focus is not on the textarea
  await page.locator('.preview-panel').click();
  await page.waitForTimeout(200);

  const scrollBeforeKey = await preview.evaluate(el => el.scrollTop);
  await page.keyboard.press(']');
  await page.waitForTimeout(300);
  const scrollAfterNext = await preview.evaluate(el => el.scrollTop);
  if (scrollAfterNext !== scrollBeforeKey) {
    console.log(`  ✅ ] key: scrollTop ${scrollBeforeKey} → ${scrollAfterNext}`);
  } else {
    console.log(`  ❌ ] key had no effect (${scrollBeforeKey})`);
  }

  await page.keyboard.press('[');
  await page.waitForTimeout(300);
  const scrollAfterPrev = await preview.evaluate(el => el.scrollTop);
  if (scrollAfterPrev < scrollAfterNext) {
    console.log(`  ✅ [ key: scrollTop ${scrollAfterNext} → ${scrollAfterPrev}`);
  } else {
    console.log(`  ❌ [ key had no effect (${scrollAfterNext})`);
  }
  await shot(page, '07-after-keyboard-shortcuts');

  // ── 10. Verify script without cues hides cue UI ────────────
  console.log('\n=== 9. Script without cues → cue UI hidden ===');
  await textarea.fill('A plain script with no cue markers at all.');
  await page.waitForTimeout(500);
  const badgesAfter = await page.locator('.tp-cue').count();
  const cueSecAfter = await page.locator('.op-cue-label').isVisible().catch(() => false);
  const cueBtnsAfter = await page.locator('button', { hasText: 'Cue ▶' }).isVisible().catch(() => false);
  console.log('  tp-cue badges hidden:', badgesAfter === 0 ? '✅' : `❌ (${badgesAfter})`);
  console.log('  dashboard cue section hidden:', !cueSecAfter ? '✅' : '❌');
  console.log('  transport cue buttons hidden:', !cueBtnsAfter ? '✅' : '❌');
  await shot(page, '08-no-cues-ui-hidden');

  console.log('\n=== All tests complete ===\n');
  await browser.close();
})().catch(async e => {
  console.error('\n💥 Test crashed:', e.message);
  process.exit(1);
});
