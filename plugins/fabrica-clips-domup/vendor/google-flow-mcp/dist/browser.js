import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { BRIDGE_JS } from './bridge.js';
export const FLOW_ORIGIN = 'https://flow.google.com';
export function optionsFromEnv() {
    const profileDir = process.env.FLOW_PROFILE_DIR || join(homedir(), '.google-flow-mcp', 'profile');
    return {
        cdpUrl: process.env.FLOW_CDP_URL || undefined,
        profileDir,
        channel: process.env.FLOW_BROWSER_CHANNEL || 'chrome',
        headless: process.env.FLOW_HEADLESS === '1',
        executablePath: process.env.FLOW_CHROME_PATH || undefined,
    };
}
export class FlowBrowser {
    opts;
    browser;
    context;
    page;
    connecting;
    constructor(opts) {
        this.opts = opts;
    }
    async launchForLogin() {
        const opts = { ...this.opts, headless: false };
        mkdirSync(opts.profileDir, { recursive: true });
        this.context = await chromium.launchPersistentContext(opts.profileDir, {
            channel: opts.executablePath ? undefined : opts.channel,
            executablePath: opts.executablePath,
            headless: false,
            viewport: null,
            args: ['--disable-blink-features=AutomationControlled'],
        });
        const page = this.context.pages()[0] ?? (await this.context.newPage());
        await page.goto(FLOW_ORIGIN + '/?hl=en', { waitUntil: 'domcontentloaded' });
        this.page = page;
        return page;
    }
    async connect() {
        if (this.opts.cdpUrl) {
            this.browser = await chromium.connectOverCDP(this.opts.cdpUrl);
            this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());
        }
        else {
            mkdirSync(this.opts.profileDir, { recursive: true });
            this.context = await chromium.launchPersistentContext(this.opts.profileDir, {
                channel: this.opts.executablePath ? undefined : this.opts.channel,
                executablePath: this.opts.executablePath,
                headless: this.opts.headless,
                viewport: null,
                args: ['--disable-blink-features=AutomationControlled'],
            });
        }
        // Reuse an open Flow tab if there is one (CDP mode), else open our own.
        const existing = this.context.pages().find((p) => p.url().startsWith(FLOW_ORIGIN));
        const page = existing ?? (await this.context.newPage());
        if (!existing)
            await page.goto(FLOW_ORIGIN + '/?hl=en', { waitUntil: 'domcontentloaded' });
        page.on('close', () => { if (this.page === page)
            this.page = undefined; });
        this.page = page;
        return page;
    }
    /** A Flow page with the bridge installed and a live session. */
    async ready() {
        let page = this.page;
        if (!page || page.isClosed()) {
            this.connecting ??= this.connect().finally(() => { this.connecting = undefined; });
            page = await this.connecting;
        }
        if (!page.url().startsWith(FLOW_ORIGIN)) {
            await page.goto(FLOW_ORIGIN + '/?hl=en', { waitUntil: 'domcontentloaded' });
        }
        if (page.url().includes('accounts.google.com') || page.url().includes('/about')) {
            throw new Error('NOT_SIGNED_IN: the browser used by google-flow-mcp is not signed in to Flow. ' +
                (this.opts.cdpUrl
                    ? 'Sign in to flow.google.com in the Chrome you attached via FLOW_CDP_URL.'
                    : 'Run `npm run login` once and sign in, then restart the MCP.'));
        }
        await page.waitForFunction(() => !!window.WIZ_global_data?.SNlM0e, null, { timeout: 30_000 });
        await page.evaluate(BRIDGE_JS);
        return page;
    }
    async evaluate(fn, ...args) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const page = await this.ready();
            try {
                return (await page.evaluate(([name, a]) => window.__flowMcp[name](...a), [fn, args]));
            }
            catch (e) {
                const msg = String(e.message || e);
                // Page navigated mid-call or bridge lost: reinstall once.
                if (attempt === 0 && /Execution context was destroyed|__flowMcp|Target closed/.test(msg))
                    continue;
                throw e;
            }
        }
        throw new Error('unreachable');
    }
    async close() {
        // Never close the user's own Chrome when attached over CDP: just let the
        // connection drop when the process exits.
        if (this.opts.cdpUrl)
            return;
        await this.context?.close().catch(() => { });
    }
}
