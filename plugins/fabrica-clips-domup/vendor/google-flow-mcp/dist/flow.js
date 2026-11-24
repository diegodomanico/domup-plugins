import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as P from './protocol.js';
import { FlowUi, UiError } from './ui.js';
export class FlowError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
    }
}
// Contador de imágenes por CUENTA de Flow (12-Nov-2026). Flow corta con PUBLIC_ERROR_PER_MODEL_DAILY_QUOTA_REACHED y no publica el
// número; lo medido apunta a ~1.000 por día. Cada imagen generada se anota acá (una línea por llamada) y la suma de las últimas
// 24 h es el consumo. Tope propio: FLOW_TOPE_IMAGENES_DIA (1000). Las ventanas que comparten cuenta comparten archivo.
const DIR_CONTADOR = process.env.FLOW_CONTADOR_DIR || join(process.cwd(), '.flow-contador').split(String.fromCharCode(92)).join('/');
const TOPE_IMAGENES = Number(process.env.FLOW_TOPE_IMAGENES_DIA ?? 1000);
function cuentaFlow() {
    if (process.env.FLOW_CUENTA)
        return process.env.FLOW_CUENTA;
    const b = basename(process.env.FLOW_PROFILE_DIR || 'profile');
    if (/^profile(-[a-z])?$/.test(b))
        return 'profile';
    if (b === 'profile-gmail')
        return 'fotos-b';
    return b;
}
const rutaContador = () => join(DIR_CONTADOR, `flow-imagenes-${cuentaFlow()}.jsonl`);
export function imagenes24h() {
    try {
        const desde = Date.now() - 24 * 3600e3;
        let n = 0;
        for (const l of readFileSync(rutaContador(), 'utf8').split('\n')) {
            if (!l)
                continue;
            try {
                const j = JSON.parse(l);
                if (j.t >= desde && j.n > 0)
                    n += j.n;
            }
            catch { /* línea rota: se ignora */ }
        }
        return n;
    }
    catch {
        return 0;
    }
}
function anotarImagenes(n, extra = {}) {
    try {
        mkdirSync(DIR_CONTADOR, { recursive: true }), appendFileSync(rutaContador(), JSON.stringify({ t: Date.now(), n, ...extra }) + '\n');
    }
    catch { /* el contador nunca rompe una generación */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newUuid = () => crypto.randomUUID().toUpperCase();
function describeError(e) {
    const s = JSON.stringify(e);
    const pub = s.match(/PUBLIC_ERROR_[A-Z_]+/)?.[0];
    if (pub === 'PUBLIC_ERROR_UNUSUAL_ACTIVITY')
        return 'Flow refused the request (PUBLIC_ERROR_UNUSUAL_ACTIVITY: its bot check flagged it). Wait a while and try again, or generate in the Flow UI yourself.';
    if (pub)
        return `Flow refused the request: ${pub}`;
    return `Flow error ${s}`;
}
export class FlowClient {
    browser;
    modelCache;
    uiQueue = Promise.resolve();
    constructor(browser) {
        this.browser = browser;
    }
    // -------------------------------------------------------------- transport
    /** Direct RPC for reads and edits that Flow accepts outside its UI (no reCAPTCHA). */
    async rpc(rpcId, payload, sourcePath) {
        const r = await this.browser.evaluate('rpc', rpcId, payload, sourcePath);
        if (r.error) {
            const code = Array.isArray(r.error) ? r.error[0] : r.error;
            const hint = code === 3 ? ' (INVALID_ARGUMENT: payload rejected; Flow may have changed its API)'
                : code === 7 ? ' (PERMISSION_DENIED)'
                    : code === 8 ? ' (RESOURCE_EXHAUSTED: out of credits or rate limited)'
                        : code === 'NOT_SIGNED_IN' ? ' (sign in to flow.google.com in the MCP browser)' : '';
            throw new FlowError(`Flow RPC ${rpcId} failed: ${JSON.stringify(r.error)}${hint}`, r.raw);
        }
        return r.data;
    }
    /** Run a UI-driving job; jobs are serialised because they share one Flow tab. */
    withUi(fn) {
        const run = async () => {
            const page = await this.browser.ready();
            try {
                return await fn(new FlowUi(page));
            }
            catch (e) {
                if (e instanceof UiError)
                    throw new FlowError(e.message);
                throw e;
            }
        };
        const next = this.uiQueue.then(run, run);
        this.uiQueue = next.catch(() => undefined);
        return next;
    }
    async status() {
        return this.browser.evaluate('status');
    }
    // -------------------------------------------------------------- account & models
    async credits() {
        const d = await this.rpc(P.RPC.getCredits, []);
        return typeof d?.[0] === 'number' ? d[0] : undefined;
    }
    async models(refresh = false) {
        if (!refresh && this.modelCache && Date.now() - this.modelCache.at < 10 * 60_000)
            return this.modelCache.models;
        const models = P.parseModels(await this.rpc(P.RPC.getModels, []));
        this.modelCache = { at: Date.now(), models };
        return models;
    }
    /** Pick a concrete model (duration and resolution are baked into Flow's model keys). */
    async resolveVideoModel(opts) {
        const models = (await this.models()).filter((m) => !/low_priority|relaxed|ultra/.test(m.key));
        if (opts.modelKey) {
            const m = (await this.models()).find((x) => x.key === opts.modelKey);
            if (!m)
                throw new FlowError(`Unknown model key "${opts.modelKey}". Use flow_list_models.`);
            return m;
        }
        const fam = (opts.family ?? 'omni').toLowerCase().replace(/\s+/g, ' ');
        const candidates = models.filter((m) => m.mode === opts.mode &&
            (m.family.toLowerCase().includes(fam) || (m.familyKey ?? '').toLowerCase() === fam.replace(/[ .-]+/g, '_')) &&
            (!opts.durationSec || m.durationSec === undefined || m.durationSec === opts.durationSec) &&
            (!opts.resolution || m.resolution === undefined || m.resolution === opts.resolution));
        if (!candidates.length) {
            const avail = models.filter((m) => m.mode === opts.mode).map((m) => `${m.key} (${m.family}, ${m.durationSec ?? '?'}s, ${m.resolution ?? '?'}, ${m.credits ?? '?'} cr)`);
            throw new FlowError(`No ${opts.mode} model for family="${opts.family ?? 'omni'}"${opts.durationSec ? `, ${opts.durationSec}s` : ''}${opts.resolution ? `, ${opts.resolution}` : ''}. Available: ${avail.join('; ')}`);
        }
        return candidates.sort((a, b) => (a.credits ?? 999) - (b.credits ?? 999))[0];
    }
    // -------------------------------------------------------------- projects
    async listProjects() { return P.parseProjects(await this.rpc(P.RPC.listProjects, P.listProjectsPayload(), '/')); }
    async createProject(title) {
        const d = await this.rpc(P.RPC.createProject, P.createProjectPayload(title), '/');
        return { id: d?.[0], title: d?.[1]?.[0] };
    }
    async contents(projectId) {
        return P.parseContents(await this.rpc(P.RPC.getProjectContents, P.projectContentsPayload(projectId), `/project/${projectId}`));
    }
    // -------------------------------------------------------------- characters
    /**
     * With a portrait prompt the character is created through Flow's character
     * builder (which generates the portrait); without one, directly by RPC.
     */
    async createCharacter(o) {
        let characterId;
        let portrait;
        if (o.portraitPrompt) {
            const r = await this.withUi(async (ui) => {
                await ui.openProject(o.projectId, '/character');
                await ui.typePrompt(o.portraitPrompt);
                const res = await ui.submitGeneration(120_000);
                if (res.error)
                    throw new FlowError(describeError(res.error));
                const id = await this.waitForUrlId(/\/character\/([0-9a-f-]{36})/);
                return { id, images: P.parseGeneratedImages(res.data), entityFromResp: res.data?.[1]?.[0]?.[5] };
            });
            characterId = r.entityFromResp ?? r.id;
            portrait = r.images;
        }
        else {
            const created = await this.rpc(P.RPC.createEntity, P.createEntityPayload(o.projectId, o.name), `/project/${o.projectId}/character`);
            characterId = P.parseEntity(created?.[0]).id;
        }
        await this.updateCharacter(o.projectId, characterId, 'name', o.name);
        if (o.personality)
            await this.updateCharacter(o.projectId, characterId, 'personality', o.personality);
        if (o.voice)
            await this.updateCharacter(o.projectId, characterId, 'voice', o.voice);
        const character = (await this.contents(o.projectId)).characters.find((c) => c.id === characterId);
        return { character, portrait };
    }
    async waitForUrlId(re, timeoutMs = 15_000) {
        const page = await this.browser.ready();
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            const m = page.url().match(re);
            if (m)
                return m[1];
            await sleep(300);
        }
        throw new FlowError('Flow did not open the new item (no id in the URL).');
    }
    async updateCharacter(projectId, characterId, field, value) {
        if (field === 'voice' && !P.VOICES.includes(value))
            throw new FlowError(`Unknown voice "${value}". Use flow_list_voices.`);
        const d = await this.rpc(P.RPC.updateEntity, P.updateEntityPayload(projectId, characterId, field, value), `/project/${projectId}/character/${characterId}`);
        return P.parseEntity(d?.[0]);
    }
    /** Change a character's look with an instruction, in the character editor. */
    async regeneratePortrait(projectId, characterId, prompt) {
        return this.withUi(async (ui) => {
            await ui.openProject(projectId, `/character/${characterId}`);
            await ui.typePrompt(prompt);
            const res = await ui.submitGeneration(120_000);
            if (res.error)
                throw new FlowError(describeError(res.error));
            return P.parseGeneratedImages(res.data);
        });
    }
    // -------------------------------------------------------------- names for UI selection
    async ingredientNames(projectId, ids) {
        const c = await this.contents(projectId);
        const out = [];
        for (const id of ids.characterIds ?? []) {
            const ch = c.characters.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
            if (!ch)
                throw new FlowError(`Character "${id}" not found in project.`);
            out.push({ name: ch.name, kind: 'character' });
        }
        const caption = (id) => c.workflows.find((w) => w.mediaId === id || w.workflowId === id)?.caption;
        for (const id of ids.imageIds ?? []) {
            const n = caption(id);
            if (!n)
                throw new FlowError(`Image ${id} not found in project.`);
            out.push({ name: n, kind: 'image' });
        }
        for (const id of ids.videoIds ?? []) {
            const n = caption(id);
            if (!n)
                throw new FlowError(`Video ${id} not found in project.`);
            out.push({ name: n, kind: 'video' });
        }
        return out;
    }
    // -------------------------------------------------------------- images
    async generateImages(o) {
        const usadas = imagenes24h();
        if (usadas + o.count > TOPE_IMAGENES) {
            throw new FlowError(`Tope propio de imágenes de Flow: ${usadas} en las últimas 24 h (tope ${TOPE_IMAGENES}). CUPO_PROPIO_IMAGENES: no se genera para no agotar el cupo diario.`);
        }
        const ingredients = await this.ingredientNames(o.projectId, { characterIds: o.characterIds, imageIds: o.referenceMediaIds });
        return this.withUi(async (ui) => {
            await ui.openProject(o.projectId);
            await ui.setMode('manual');
            await ui.clearPrompt();
            await ui.configure({ kind: 'image', aspect: o.aspect, count: o.count });
            for (const i of ingredients)
                await ui.addIngredient(i.name, i.kind);
            await ui.typePrompt(o.prompt);
            const res = await ui.submitGeneration(120_000);
            if (res.error) {
                const d = describeError(res.error);
                // El corte real de Flow queda anotado con el consumo del momento: así se confirma cuál es el cupo de verdad.
                if (/QUOTA/.test(d)) {
                    const u = imagenes24h();
                    anotarImagenes(0, { cupo_flow: true, usadas_24h: u });
                    throw new FlowError(`${d} (llevábamos ${u} imágenes en 24 h)`);
                }
                throw new FlowError(d);
            }
            anotarImagenes(o.count);
            return P.parseGeneratedImages(res.data);
        });
    }
    async getMedia(mediaId) { return P.parseMedia(await this.rpc(P.RPC.getMedia, [mediaId])); }
    // -------------------------------------------------------------- video
    /**
     * Generate video through Flow's composer. Returns Flow's quote and, unless
     * dryRun, the queued jobs. Refuses when the quote exceeds maxCredits.
     */
    async generateVideo(o) {
        const ingredients = await this.ingredientNames(o.projectId, { characterIds: o.characterIds, imageIds: o.imageIds, videoIds: o.videoIds });
        return this.withUi(async (ui) => {
            await ui.openProject(o.projectId);
            await ui.setMode('manual');
            await ui.clearPrompt();
            for (const i of ingredients)
                await ui.addIngredient(i.name, i.kind);
            const isOmni = o.model.familyKey === 'abra' || /omni/i.test(o.model.family);
            const quote = await ui.configure({
                kind: 'video', input: 'ingredients', aspect: o.aspect, model: o.model.family, count: o.count,
                resolution: isOmni ? o.model.resolution : undefined,
                durationSec: isOmni ? o.model.durationSec : undefined,
            });
            if (quote === undefined)
                throw new FlowError('Could not read Flow\'s credit quote; not generating.');
            if (quote > o.maxCredits) {
                await ui.clearPrompt().catch(() => { });
                throw new FlowError(`Refusing: Flow quotes ${quote} credits, above max_credits=${o.maxCredits}. Raise max_credits to proceed.`);
            }
            await ui.typePrompt(o.prompt);
            if (o.dryRun) {
                await ui.clearPrompt().catch(() => { });
                return { dryRun: true, quotedCredits: quote, ingredients };
            }
            const res = await ui.submitGeneration();
            if (res.error)
                throw new FlowError(describeError(res.error));
            return { quotedCredits: quote, rpc: res.rpcId, ...P.parseVideoJobs(res.data) };
        });
    }
    async videoStatus(mediaIds) { return P.parseVideoStatus(await this.rpc(P.RPC.videoStatus, P.videoStatusPayload(mediaIds))); }
    async waitForVideos(mediaIds, timeoutSec = 600, pollSec = 8) {
        const deadline = Date.now() + timeoutSec * 1000;
        let last = await this.videoStatus(mediaIds);
        while (last.items.some((i) => i.state !== 'succeeded' && i.state !== 'failed') && Date.now() < deadline) {
            await sleep(pollSec * 1000);
            last = await this.videoStatus(mediaIds);
        }
        const items = await Promise.all(last.items.map(async (i) => i.state === 'succeeded' ? { ...i, videoUrl: (await this.getMedia(i.mediaId)).videoUrl } : i));
        return { items, creditsLeft: last.creditsLeft, timedOut: items.some((i) => i.state !== 'succeeded' && i.state !== 'failed') };
    }
    // -------------------------------------------------------------- scenes
    async createScene(projectId) {
        return P.parseCreatedScene(await this.rpc(P.RPC.createScene, P.createScenePayload(projectId), `/project/${projectId}`));
    }
    async addToScene(projectId, sceneId, workflowIds, index) {
        const d = await this.rpc(P.RPC.addWorkflowsToScene, P.addToScenePayload(projectId, sceneId, workflowIds, index), `/project/${projectId}/scene/${sceneId}`);
        return P.parseAddedClips(d);
    }
    /** Scenes hold generations (workflows); map media ids to their workflow ids. */
    async workflowIdsFor(projectId, ids) {
        const c = await this.contents(projectId);
        return ids.map((id) => c.workflows.find((w) => w.workflowId === id || w.mediaId === id)?.workflowId
            ?? c.media.find((m) => m.mediaId === id)?.workflowId ?? id);
    }
    // -------------------------------------------------------------- agent settings (direct RPC; verified)
    async setInstructions(projectId, list, enabled = true) {
        const d = await this.rpc(P.RPC.updateAgentInfo, P.setInstructionsPayload(projectId, list, enabled), `/project/${projectId}`);
        return P.parseAgentInfo(d?.[0]);
    }
    async setImageDefaults(projectId, aspect, count, model = 'narwhal_display') {
        return this.rpc(P.RPC.updateAgentInfo, P.imageDefaultsPayload(projectId, aspect, count, model), `/project/${projectId}`);
    }
    async setVideoDefaults(projectId, model, aspect, count) {
        return this.rpc(P.RPC.updateAgentInfo, P.videoDefaultsPayload(projectId, model, aspect, count), `/project/${projectId}`);
    }
    async setApprovalPolicy(projectId, policy) {
        return this.rpc(P.RPC.updateAgentInfo, P.approvalPolicyPayload(projectId, policy), `/project/${projectId}`);
    }
    async projectDefaults(projectId) {
        const d = await this.rpc(P.RPC.getProject, [`tools/PINHOLE/projects/${projectId}`], `/project/${projectId}`);
        const a = d?.[5];
        const img = a?.[2]?.[0];
        const vid = a?.[2]?.[1];
        const name = (map, n) => Object.entries(map).find(([, v]) => v === n)?.[0];
        return {
            imageDefaults: img ? { aspect: name(P.IMAGE_ASPECT, img[1]), count: img[2], model: img[3] } : undefined,
            videoDefaults: vid ? { model: vid[0], aspect: name(P.VIDEO_ASPECT, vid[1]), count: vid[2] } : undefined,
            creditSpendApproval: a?.[3] === 2 ? 'auto_approve' : 'always_ask',
        };
    }
    // -------------------------------------------------------------- agent chat (through the agent panel)
    async listSessions(projectId) { return P.parseSessions(await this.rpc(P.RPC.listSessions, [projectId], `/project/${projectId}`)); }
    /**
     * Send one message to Flow's agent via its panel. If it asks to spend
     * credits, approve only when the quoted cost is <= maxCredits.
     */
    async agentChat(o) {
        const ingredients = await this.ingredientNames(o.projectId, { characterIds: o.characterIds, imageIds: o.imageIds }); // LOCAL PATCH: image_ids
        return this.withUi(async (ui) => {
            await ui.openProject(o.projectId);
            if (o.newSession)
                await ui.startNewAgentSession();
            await ui.setMode('agent');
            await ui.clearPrompt();
            for (const i of ingredients)
                await ui.addIngredient(i.name, i.kind);
            await ui.typePrompt(o.message);
            const turns = [P.parseAgentChunks(await ui.submitAgentTurn())];
            let approval = 'none';
            const ask = turns[0].permissionRequest;
            if (ask) {
                if (o.maxCredits !== undefined && (ask.totalCost ?? Infinity) <= o.maxCredits) {
                    turns.push(P.parseAgentChunks(await ui.answerPermission('Approve')));
                    approval = 'approved';
                }
                else
                    approval = 'awaiting';
            }
            return this.summarise(o.projectId, turns, approval);
        });
    }
    async agentAnswerPermission(projectId, answer) {
        return this.withUi(async (ui) => {
            await ui.openProject(projectId);
            const turn = P.parseAgentChunks(await ui.answerPermission(answer));
            return this.summarise(projectId, [turn], answer === 'Approve' ? 'approved' : 'none');
        });
    }
    async summarise(projectId, turns, approval) {
        const session = (await this.listSessions(projectId).catch(() => []))[0];
        return {
            session,
            reply: turns.map((t) => t.text).filter(Boolean).join('\n\n'),
            pendingPermission: approval === 'awaiting' ? turns[0].permissionRequest : undefined,
            approval,
            generatedMediaIds: [...new Set(turns.flatMap((t) => t.generatedMediaIds))],
            toolCalls: turns.flatMap((t) => t.toolCalls).filter((c) => c.name !== 'open_chat_panel'),
        };
    }
    // silence unused warning for helpers kept for future direct modes
    static _uuid = newUuid;
}
