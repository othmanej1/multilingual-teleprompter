// Smoke-test for presenter notes panel
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page, name) {
  const p = path.join(SCREENSHOT_DIR, name + '.png');
  await page.screenshot({ path: p });
  console.log('  📸', name);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx    = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page   = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('  [page error]', m.text()); });

  console.log('\n=== 1. Load app ===');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('.app');
  await shot(page, 'notes-01-initial');

  // ── 2. Notes button visible in toolbar ────────────────────
  console.log('\n=== 2. Notes button in editor toolbar ===');
  const notesBtn = page.locator('button.btn-notes-toggle');
  const btnVisible = await notesBtn.isVisible();
  console.log('  Notes button visible:', btnVisible ? '✅' : '❌');

  // ── 3. Notes panel hidden by default ──────────────────────
  console.log('\n=== 3. Notes panel hidden by default ===');
  const notesPanel = page.locator('.notes-panel');
  // Clear any persisted notesOpen state from previous test sessions
  await page.evaluate(() => localStorage.setItem('tp_notes_open', 'false'));
  await page.reload();
  await page.waitForSelector('.app');
  const panelHidden = !(await page.locator('.notes-panel').isVisible().catch(() => false));
  console.log('  Panel hidden initially:', panelHidden ? '✅' : '❌');

  // ── 4. Toggle opens the notes panel ───────────────────────
  console.log('\n=== 4. Click Notes button → panel opens ===');
  const notesBtnAfterReload = page.locator('button.btn-notes-toggle');
  await notesBtnAfterReload.click();
  await page.waitForTimeout(300);
  const panelVisible = await page.locator('.notes-panel').isVisible();
  console.log('  Notes panel opens:', panelVisible ? '✅' : '❌');
  await shot(page, 'notes-02-panel-open');

  // ── 5. Header text ─────────────────────────────────────────
  console.log('\n=== 5. Panel header content ===');
  const labelText = await page.locator('.notes-label').innerText();
  const badgeText = await page.locator('.notes-badge').innerText();
  console.log('  Label:', JSON.stringify(labelText), labelText.toLowerCase().includes('notes') ? '✅' : '❌');
  console.log('  Badge:', JSON.stringify(badgeText), badgeText.toLowerCase().includes('output') ? '✅' : '❌');

  // ── 6. Type notes and verify they persist ─────────────────
  console.log('\n=== 6. Type notes — verify saved ===');
  const notesEditor = page.locator('.notes-editor');
  await notesEditor.fill('Remember to slow down at the Arabic section. Cue the music after [CUE] 2.');
  await page.waitForTimeout(1200); // wait for 800ms debounce + margin

  const saveStatus = await page.locator('.meta-save').innerText();
  // After typing, it should show "Saved" or be in saving state
  console.log('  Save status after typing:', JSON.stringify(saveStatus));
  await shot(page, 'notes-03-with-content');

  // ── 7. Reload → notes content restored ────────────────────
  console.log('\n=== 7. Reload → notes content persists ===');
  await page.reload();
  await page.waitForSelector('.app');
  // Notes panel should reopen (tp_notes_open was true when we reloaded)
  await page.waitForTimeout(400);
  const notesEditorAfterReload = page.locator('.notes-editor');
  const panelOpenAfterReload = await notesEditorAfterReload.isVisible();
  if (!panelOpenAfterReload) {
    // Open the panel if it's closed
    await page.locator('button.btn-notes-toggle').click();
    await page.waitForTimeout(300);
  }
  const restoredContent = await page.locator('.notes-editor').inputValue();
  if (restoredContent.includes('slow down')) {
    console.log('  ✅ Notes content restored after reload');
  } else {
    console.log('  ❌ Notes content not restored:', JSON.stringify(restoredContent));
  }
  await shot(page, 'notes-04-restored-after-reload');

  // ── 8. Green dot indicator when panel is closed and notes exist ──
  console.log('\n=== 8. Green dot indicator when panel is closed ===');
  await page.locator('button.btn-notes-toggle').click(); // close panel
  await page.waitForTimeout(300);
  const panelClosed = !(await page.locator('.notes-panel').isVisible());
  const dotVisible = await page.locator('.notes-indicator').isVisible();
  console.log('  Panel closed:', panelClosed ? '✅' : '❌');
  console.log('  Green dot indicator visible:', dotVisible ? '✅' : '❌');
  await shot(page, 'notes-05-dot-indicator');

  // ── 9. Notes NOT in BroadcastChannel / output window ──────
  // (behavioural: notes are in Script.notes, which is only used by App.tsx
  //  and never passed to useSyncChannel — verify by checking that
  //  no sync message contains the notes string)
  console.log('\n=== 9. Notes field not in Script.notes of BroadcastChannel ===');
  const interceptedMessages = [];
  await page.evaluate(() => {
    const ch = new BroadcastChannel('tp_output_sync');
    ch.onmessage = (e) => window.__testMessages = (window.__testMessages || []).concat([e.data]);
  });
  // trigger a script update to see what's sent over the channel
  const textarea = page.locator('textarea.script-editor');
  await textarea.fill('Test script for output sync check.');
  await page.waitForTimeout(400);
  const msgs = await page.evaluate(() => window.__testMessages || []);
  const hasNotes = msgs.some(m => m.content && m.content.includes('slow down'));
  console.log('  Notes NOT in BroadcastChannel script messages:', !hasNotes ? '✅' : '❌');

  // ── 10. Notes are per-script — switch scripts, notes stay separate ──
  console.log('\n=== 10. Notes are per-script ===');
  // Open library and create a new script
  await page.locator('button', { hasText: 'Scripts' }).click();
  await page.waitForTimeout(300);
  await page.locator('.lib-new').click();
  await page.waitForTimeout(400);
  // Open notes panel on new script
  const notesBtnNew = page.locator('button.btn-notes-toggle');
  const isOpen = await page.locator('.notes-panel').isVisible();
  if (!isOpen) await notesBtnNew.click();
  await page.waitForTimeout(300);
  const newScriptNotes = await page.locator('.notes-editor').inputValue();
  if (newScriptNotes === '') {
    console.log('  ✅ New script has empty notes (not inherited from previous script)');
  } else {
    console.log('  ❌ New script unexpectedly has notes:', JSON.stringify(newScriptNotes));
  }
  await shot(page, 'notes-06-per-script');

  console.log('\n=== All tests complete ===\n');
  await browser.close();
})().catch(async e => {
  console.error('\n💥 Test crashed:', e.message);
  process.exit(1);
});
