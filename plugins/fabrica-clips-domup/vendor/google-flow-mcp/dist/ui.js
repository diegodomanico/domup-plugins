/**
 * Drives Flow's own UI for anything that generates media. Flow scores
 * generation requests with reCAPTCHA Enterprise; requests assembled outside
 * its normal UI flow are rejected (PUBLIC_ERROR_UNUSUAL_ACTIVITY). So the MCP
 * does what a person does: attach ingredients, pick settings, type the prompt
 * and press Generate, using real (trusted) mouse and keyboard input. It then
 * reads Flow's own network response to return ids to the caller.
 *
 * Nothing here tries to disguise automation or get around Flow's checks. If
 * Flow refuses a request, the error is returned as-is and not retried.
 */
const GEN_RPCS = /rpcids=(MZZa6b|YhhmEf|eb1hJf|nprQif|jIps6|fZytfe|ogiZ0b)\b/;
const STREAM_CHAT = /FlowCreationAgentService\/StreamChat/;
export class UiError extends Error {
}
/** Parse a batchexecute body into the wrb.fr frame for rpcId (or the first one). */
export function parseBatch(text, rpcId) {
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('['))
            continue;
        try {
            for (const e of JSON.parse(t)) {
                if (Array.isArray(e) && e[0] === 'wrb.fr' && (!rpcId || e[1] === rpcId)) {
                    return { rpcId: e[1], data: e[2] ? JSON.parse(e[2]) : undefined, error: e[5] ?? undefined };
                }
            }
        }
        catch { /* partial line */ }
    }
    return {};
}
export function parseStream(text) {
    const out = [];
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('['))
            continue;
        try {
            for (const e of JSON.parse(t))
                if (Array.isArray(e) && e[0] === 'wrb.fr' && typeof e[2] === 'string')
                    out.push(JSON.parse(e[2]));
        }
        catch { /* */ }
    }
    return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export class FlowUi {
    page;
    constructor(page) {
        this.page = page;
    }
    // ------------------------------------------------------------------ navigation
    async openProject(projectId, sub = '') {
        const target = `/project/${projectId}${sub}`;
        if (new URL(this.page.url()).pathname !== target) {
            await this.page.goto('https://flow.google.com' + target + '?hl=en', { waitUntil: 'domcontentloaded' }); // LOCAL PATCH: force English UI
        }
        await this.generateButton().waitFor({ state: 'visible', timeout: 30_000 });
        await this.page.waitForTimeout(800);
    }
    // ------------------------------------------------------------------ composer parts
    /** The visible composer = the visible "Start generation" button's nearest ancestor holding an editor. */
    generateButton() { return this.page.locator('button[aria-label="Start generation"]:visible').first(); }
    async tagComposer() {
        const ok = await this.page.evaluate(() => {
            document.querySelectorAll('[data-flowmcp-composer]').forEach((e) => e.removeAttribute('data-flowmcp-composer'));
            let n = [...document.querySelectorAll('button[aria-label="Start generation"]')].find((b) => b.offsetParent) ?? null;
            while (n && !n.querySelector('[contenteditable=true]'))
                n = n.parentElement;
            if (n)
                n.setAttribute('data-flowmcp-composer', '1');
            return !!n;
        });
        if (!ok)
            throw new UiError('Flow composer not found on this page.');
        return this.page.locator('[data-flowmcp-composer]');
    }
    async clearPrompt() {
        const c = await this.tagComposer();
        const clear = c.locator('button.clear-button:visible, button[aria-label="Clear prompt"]:visible').first();
        if (await clear.count()) {
            await clear.click();
            await this.page.waitForTimeout(500);
        }
        const chips = await c.locator('flow-ingredient-chip').count();
        if (chips)
            throw new UiError(`Could not clear ${chips} existing ingredient(s) from the prompt box.`);
    }
    async chipKinds() {
        const c = await this.tagComposer();
        return c.locator('flow-ingredient-chip').evaluateAll((els) => els.map((el) => {
            const t = [...el.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()).find((n) => /-ingredient-chip$/.test(n)) ?? '';
            return t.replace(/^flow-/, '').replace(/-ingredient-chip$/, '');
        }));
    }
    // ------------------------------------------------------------------ settings menu
    menuOpen() { return this.page.getByText(/Generating will use \d+ credits?/).first(); }
    async openSettings() {
        if (await this.menuOpen().isVisible().catch(() => false))
            return;
        const c = await this.tagComposer();
        await c.locator('button[aria-label="Settings trigger"]').click();
        await this.menuOpen().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => { });
    }
    async closeSettings() {
        if (!(await this.menuOpen().isVisible().catch(() => false)))
            return;
        const c = await this.tagComposer();
        await c.locator('button[aria-label="Settings trigger"]').click();
        await this.menuOpen().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => { });
    }
    /** Tag the smallest visible element whose normalised text matches `source` and click it. */
    async clickText(source, what, required = true) {
        const found = await this.page.evaluate((src) => {
            const re = new RegExp(src);
            const txt = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ');
            const vis = (e) => !!(e.offsetParent && e.getBoundingClientRect().width > 0);
            document.querySelectorAll('[data-flowmcp-click]').forEach((e) => e.removeAttribute('data-flowmcp-click'));
            const el = [...document.querySelectorAll('button, [role=radio], [role=tab], [role=option], [role=menuitem], mat-option, li, div, span')]
                .filter((e) => vis(e) && re.test(txt(e)))
                .sort((a, b) => txt(a).length - txt(b).length || a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
            if (el)
                el.setAttribute('data-flowmcp-click', '1');
            return !!el;
        }, source);
        if (!found) {
            if (required)
                throw new UiError(`Flow setting not available: ${what}`);
            return false;
        }
        await this.page.locator('[data-flowmcp-click]').first().click();
        await this.page.waitForTimeout(400);
        return true;
    }
    async readQuote() {
        const t = await this.menuOpen().textContent().catch(() => null);
        const m = t?.match(/Generating will use (\d+)/);
        return m ? Number(m[1]) : undefined;
    }
    async isManualMode() {
        await this.openSettings();
        const manual = await this.page.evaluate(() => /image\s*Image[\s\S]*videocam\s*Video/.test([...document.querySelectorAll('body *')].map((e) => e.innerText || '').find((t) => /Generating will use/.test(t) && t.length < 600) ?? ''));
        await this.closeSettings();
        return manual;
    }
    async setMode(want) {
        // LOCAL PATCH: current Flow shows an agent-only composer (manual 'Settings trigger' is hidden).
        const c0 = await this.tagComposer();
        if (!(await c0.locator('button[aria-label="Settings trigger"]').isVisible().catch(() => false))) {
            if (want === 'agent')
                return;
            // PARCHE 9 (17-Nov-2026): el botón «Agent» quedó prendido para la cuenta y oculta el compositor manual. Se apaga con un clic.
            await c0.locator('button', { hasText: /^\s*Agent\s*$/ }).first().click().catch(() => { });
            await this.page.waitForTimeout(1500);
            const c1 = await this.tagComposer();
            if (!(await c1.locator('button[aria-label="Settings trigger"]').isVisible().catch(() => false)))
                throw new UiError('Flow shows only the agent composer in this project and clicking Agent did not bring back manual mode. Use flow_agent_chat.');
            return;
        }
        for (let i = 0; i < 2; i++) {
            if ((await this.isManualMode()) === (want === 'manual'))
                return;
            const c = await this.tagComposer();
            await c.locator('button', { hasText: /^\s*Agent\s*$/ }).first().click();
            await this.page.waitForTimeout(800);
        }
        throw new UiError(`Could not switch Flow's composer to ${want} mode.`);
    }
    /** Apply settings and return Flow's own credit quote. */
    async configure(s) {
        await this.openSettings();
        await this.clickText(s.kind === 'image' ? '^image Image$' : '^videocam Video$', s.kind);
        if (s.kind === 'video')
            await this.clickText(s.input === 'frames' ? '^crop_free Frames$' : '^chrome_extension Ingredients$', s.input ?? 'ingredients');
        if (s.aspect) {
            const icon = { '16:9': 'crop_16_9', '9:16': 'crop_9_16', '1:1': 'crop_square', '4:3': 'crop_landscape', '3:4': 'crop_portrait' };
            await this.clickText(`^${icon[s.aspect]} ${esc(s.aspect)}$`, `aspect ${s.aspect}`);
        }
        if (s.model) {
            const current = await this.page.getByText(/arrow_drop_down/).filter({ visible: true }).first().textContent().catch(() => '');
            if (!current?.includes(s.model)) {
                await this.clickText('^(🍌 )?[A-Za-z].* arrow_drop_down$', 'model menu');
                await this.clickText(`^(volume_up )?(🍌 )?${esc(s.model)}$`, `model "${s.model}"`);
                await this.page.waitForTimeout(600);
            }
        }
        if (s.resolution)
            await this.clickText(`^${esc(s.resolution)}$`, `resolution ${s.resolution} for ${s.model ?? 'this model'}`);
        if (s.durationSec)
            await this.clickText(`^${s.durationSec}s$`, `${s.durationSec}s duration for ${s.model ?? 'this model'}`);
        if (s.count)
            await this.clickText(`^x${s.count}$`, `count x${s.count}`);
        await this.page.waitForTimeout(500);
        const quote = await this.readQuote();
        await this.closeSettings();
        return quote;
    }
    // ------------------------------------------------------------------ ingredients
    /**
     * Attach one ingredient from the project's library by display name
     * (character name, or an image/video caption). Adds one at a time because
     * the picker adds only the highlighted item.
     */
    async addIngredient(name, kind) {
        const c = await this.tagComposer();
        const before = await c.locator('flow-ingredient-chip').count();
        await c.locator('button[aria-label="Add ingredients to the prompt box"]').click();
        const options = this.page.locator('.asset-item-container button[role=option]');
        await options.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { });
        const search = this.page.getByPlaceholder('Search assets');
        if (await search.isVisible().catch(() => false)) {
            await search.fill(name);
            await this.page.waitForTimeout(1200);
        }
        const typeWord = kind === 'character' ? 'Character' : kind === 'video' ? 'Video' : 'Image';
        const item = options.filter({ hasText: new RegExp(`^\\s*${esc(name)}\\s*${typeWord}\\b`, 'i') }).first();
        if (!(await item.count())) {
            await this.page.keyboard.press('Escape').catch(() => { });
            throw new UiError(`No ${kind} named "${name}" in this project's library.`);
        }
        await item.click();
        // LOCAL PATCH: current Flow may add the item on click and close the picker. Only run the old
        // two-step flow (highlight, then "Add to prompt") when no chip appeared; the chip check below still validates.
        await this.page.waitForTimeout(1200);
        if ((await c.locator('flow-ingredient-chip').count()) <= before) {
            await this.page.getByText('Add to prompt', { exact: true }).click({ timeout: 5_000 }).catch(() => { });
        }
        await this.page.waitForTimeout(800);
        const kinds = await this.chipKinds();
        if (kinds.length !== before + 1 || kinds[kinds.length - 1] !== kind) {
            throw new UiError(`Flow attached the wrong ingredient (expected ${kind} "${name}", prompt now has: ${kinds.join(', ') || 'nothing'}).`);
        }
    }
    // ------------------------------------------------------------------ prompt + submit
    async typePrompt(text) {
        const c = await this.tagComposer();
        const ed = c.locator('[contenteditable=true]').first();
        await ed.click();
        await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await this.page.keyboard.press('Backspace');
        await this.page.keyboard.insertText(text);
        await this.page.waitForTimeout(300);
        const got = (await ed.innerText()).trim();
        if (!got.includes(text.slice(0, 20).trim()))
            throw new UiError('Prompt text did not land in Flow\'s editor.');
    }
    /** Press Generate and return Flow's own generation response. */
    async submitGeneration(timeoutMs = 60_000) {
        const wait = this.page.waitForResponse((r) => GEN_RPCS.test(r.url()) && r.request().method() === 'POST', { timeout: timeoutMs });
        await this.generateButton().click();
        const resp = await wait.catch(() => undefined);
        if (!resp)
            throw new UiError('Flow did not send a generation request after pressing Generate (a setting may be missing or the button was disabled).');
        return parseBatch(await resp.text());
    }
    /** Send the composer to the agent and return all StreamChat chunks of that turn. */
    async submitAgentTurn(timeoutMs = 180_000) {
        const wait = this.page.waitForResponse((r) => STREAM_CHAT.test(r.url()), { timeout: timeoutMs });
        await this.generateButton().click();
        return parseStream(await (await wait).text());
    }
    async answerPermission(answer, timeoutMs = 180_000) {
        const ctl = this.page.getByRole('radio', { name: answer, exact: true }).last();
        await ctl.waitFor({ state: 'visible', timeout: 10_000 });
        const wait = this.page.waitForResponse((r) => STREAM_CHAT.test(r.url()), { timeout: timeoutMs });
        await ctl.click();
        return parseStream(await (await wait).text());
    }
    async startNewAgentSession() {
        const btn = this.page.locator('button:has(mat-icon:text-is("edit_square")):visible').first();
        if (await btn.count()) {
            await btn.click();
            await this.page.waitForTimeout(800);
        }
    }
}
