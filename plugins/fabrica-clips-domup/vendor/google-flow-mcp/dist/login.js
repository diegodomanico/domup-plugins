#!/usr/bin/env node
/**
 * One-time sign-in for the dedicated browser profile (not needed with FLOW_CDP_URL).
 * Opens Chrome on flow.google.com; sign in with Google, open any project, then close the window.
 */
import { FlowBrowser, optionsFromEnv } from './browser.js';
const opts = optionsFromEnv();
if (opts.cdpUrl) {
    console.log('FLOW_CDP_URL is set: the MCP uses your own Chrome, so no separate login is needed.');
    process.exit(0);
}
const browser = new FlowBrowser(opts);
const page = await browser.launchForLogin();
console.log(`Profile: ${opts.profileDir}`);
console.log('A Chrome window opened on flow.google.com. Sign in with your Google account, open Flow once, then close the window.');
await new Promise((res) => page.context().on('close', () => res()));
console.log('Saved. You can now start the MCP server.');
