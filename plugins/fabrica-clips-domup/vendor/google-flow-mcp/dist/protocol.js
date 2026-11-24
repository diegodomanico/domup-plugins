/**
 * Google Flow wire protocol: RPC ids, payload builders and response parsers.
 *
 * Reverse engineered from flow.google.com (build boq_labs-ai-sandbox-frontend_20260925).
 * Payloads are protobuf messages serialised as JSON arrays (field N -> index N-1).
 * This module is pure (no Node or DOM APIs) so it can also run inside the page.
 */
export const RPC = {
    // projects
    listProjects: 'UpteDb', // FlowService.GetProjects
    createProject: 'jHPbke', // AiSandbox.CreateProject
    getProject: 'ngNC2', // AiSandbox.GetProject
    getProjectContents: 'Zzl0ze', // FlowService.GetProjectContents
    // account / models
    getCredits: 'nzlxg', // VideoFxService.GetCredits
    getModels: 'HTrJv', // FlowService.GetModels
    listModelStatuses: 'yBhWQ', // FlowService.ListModelStatuses
    // characters (EntityService)
    createEntity: 'C4BZMd',
    updateEntity: 'rzMKMb',
    // media
    generateImages: 'ogiZ0b', // FlowService.BatchGenerateImages   (reCAPTCHA IMAGE_GENERATION)
    getMedia: 'as29s', // FlowService.GetMedia
    // video (VideoFxService, reCAPTCHA VIDEO_GENERATION)
    videoText: 'YhhmEf', // BatchAsyncGenerateVideoText
    videoReferences: 'MZZa6b', // BatchAsyncGenerateVideoReferenceImages
    videoStartImage: 'eb1hJf', // BatchAsyncGenerateVideoStartImage
    videoStartEnd: 'nprQif', // BatchAsyncGenerateVideoStartAndEndImage
    videoEdit: 'jIps6', // BatchAsyncGenerateVideoEditVideo
    videoStatus: 'jwpduf', // BatchCheckAsyncVideoGenerationStatus
    cancelGeneration: 'CK0Pk', // FlowService.CancelMediaGeneration
    // scenes
    createScene: 'rqZuUc', // FlowService.CreateScene
    addWorkflowsToScene: 'oWTRd', // FlowService.AddWorkflowsToScene
    updateSceneWorkflows: 'GoMJte', // FlowService.UpdateSceneWorkflows
    // agent
    updateAgentInfo: 'Kcr7Ub', // AiSandbox.UpdateAgentInfo (instructions + defaults)
    createSession: 'csbIsb', // FlowCreationAgentService.CreateSession
    listSessions: 'mrlkwd', // FlowCreationAgentService.ListSessions
    cancelTurn: 'Az898d', // FlowCreationAgentService.CancelTurn
    // legacy model preambles (read-only; not used by the current UI)
    listPreambles: 'OqcWz',
};
/** reCAPTCHA Enterprise actions used by the page's own grecaptcha client. */
export const RECAPTCHA = {
    image: 'IMAGE_GENERATION',
    video: 'VIDEO_GENERATION',
    chat: 'CHAT_GENERATION',
};
const TOOL_ID = 22; // Flow's tool/surface id inside the client context
export const VIDEO_ASPECT = { '9:16': 1, '16:9': 2, '1:1': 0 };
export const IMAGE_ASPECT = { '1:1': 1, '9:16': 2, '16:9': 3, '3:4': 4, '4:3': 5 };
export const RESOLUTION = { '720p': 1, '1080p': 2, '4k': 3, '360p': 4 };
export const APPROVAL_POLICY = { always_ask: 1, auto_approve: 2 };
export const IMAGE_MODELS = { 'nano-banana-2': 'NARWHAL' };
export const VOICES = [
    'achernar', 'achird', 'algenib', 'algieba', 'alnilam', 'aoede', 'autonoe', 'callirrhoe', 'charon', 'despina',
    'enceladus', 'erinome', 'fenrir', 'gacrux', 'iapetus', 'kore', 'laomedeia', 'leda', 'orus', 'puck',
    'pulcherrima', 'rasalgethi', 'sadachbia', 'sadaltager', 'schedar', 'sulafat', 'umbriel', 'vindemiatrix',
    'zephyr', 'zubenelgenubi',
];
export const projectName = (projectId) => `projects/${projectId}`;
/** Client context message ($x). `token` is a reCAPTCHA Enterprise token for generation calls. */
export function clientContext(projectId, token) {
    const ctx = [null, TOOL_ID, null, null, null, projectId];
    if (token)
        ctx.push(null, null, null, null, [token, 1]);
    return ctx;
}
/** Structured prompt input: [null, null, [[[text]]]] */
export const textInput = (prompt) => [null, null, [[[prompt]]]];
/** Per-item generation metadata (_.Fy): [sceneId?, workflowId?, ?, ?, placeholderId, requestId] */
const itemMeta = (uuid) => [null, null, null, null, uuid(), uuid()];
const resMsg = (r) => (r && r !== '720p' ? [RESOLUTION[r]] : null);
/** Image reference (_.AO): oneof field 2 = media id. */
const imageRef = (mediaId) => [null, mediaId];
// ---------------------------------------------------------------------------
// Projects
export const listProjectsPayload = () => ['projects/*', 21, null, null, null, null, [1]];
export const createProjectPayload = (title) => ['projects/*', [null, [title]], [null, TOOL_ID]];
export const projectContentsPayload = (projectId) => [projectName(projectId), null, null, null, [1]];
export function parseProjects(data) {
    return (data?.[0] ?? []).map((p) => ({
        id: p[0],
        title: p[1]?.[0] ?? '',
        updated: ts(p[1]?.[2]),
        thumbnailUrl: p[1]?.[3] ?? undefined,
    }));
}
const str = (x) => (typeof x === 'string' && x ? x : undefined);
/** Generation details block: at index 6 for images, 7 for videos (videos carry an extra null). */
const genInfo = (m) => [m?.[6], m?.[7]].find((x) => Array.isArray(x?.[0]) && typeof x[0][7] === 'string')?.[0];
function ts(t) {
    if (!Array.isArray(t) || typeof t[0] !== 'number')
        return undefined;
    return new Date(t[0] * 1000 + Math.floor((t[1] ?? 0) / 1e6)).toISOString();
}
export function parseEntity(e) {
    const info = e?.[3] ?? [];
    const ci = info[2] ?? [];
    return {
        id: e[1],
        projectId: e[0],
        name: info[1] ?? '',
        portraitWorkflowIds: (ci[0] ?? []).map((x) => x?.[0]).filter(Boolean),
        voice: ci[1]?.[0]?.[1] ?? undefined,
        personality: ci[2] ?? undefined,
        portraitMediaId: typeof e[4] === 'string' ? e[4] : undefined,
        created: ts(e[6]),
        updated: ts(e[7]),
    };
}
export const createEntityPayload = (projectId, name) => [[projectId, null, null, [1, name, []]]];
export const CHARACTER_MASK = {
    name: 'entity_info.display_name',
    personality: 'entity_info.character_info.personality_notes',
    voice: 'entity_info.character_info.audio_references',
};
export function updateEntityPayload(projectId, entityId, field, value) {
    let info;
    if (field === 'name')
        info = [1, value];
    else if (field === 'personality')
        info = [1, null, [null, null, value]];
    else
        info = [1, null, [null, [[null, value]]]];
    return [[projectId, entityId, null, info], [[CHARACTER_MASK[field]]]];
}
export function generateImagesPayload(r) {
    const ctx = clientContext(r.projectId, r.token);
    const items = Array.from({ length: r.count }, () => {
        const seed = Math.floor(Math.random() * 2_000_000_000);
        const item = [null, null, null, seed, IMAGE_ASPECT[r.aspect], r.model, null, ctx, [[[r.prompt]]], null, null, null, r.uuid(), r.uuid()];
        if (r.referenceMediaIds?.length)
            item[1] = r.referenceMediaIds.map((id) => [null, id]);
        return item;
    });
    const payload = [null, items, 1, ctx];
    if (r.characterId)
        payload.push([r.uuid(), null, [r.characterId, [0]]]);
    return payload;
}
export function parseGeneratedImages(data) {
    const media = data?.[0] ?? [];
    const workflows = data?.[1] ?? [];
    return media.map((m, i) => ({
        mediaId: m[0],
        workflowId: m[2] ?? workflows[i]?.[0],
        url: findUrl(m, 'image'),
        caption: workflows[i]?.[3]?.[0],
    }));
}
export const VIDEO_RPC = {
    text: RPC.videoText,
    references: RPC.videoReferences,
    start_frame: RPC.videoStartImage,
    start_end_frames: RPC.videoStartEnd,
};
/** Mirrors the page's own request builder for each mode (see PROTOCOL.md). */
export function generateVideoPayload(r) {
    const text = textInput(r.prompt);
    const aspect = VIDEO_ASPECT[r.aspect];
    const res = resMsg(r.resolution);
    const items = Array.from({ length: r.count }, () => {
        const meta = itemMeta(r.uuid);
        switch (r.mode) {
            case 'text': // h2a: 1 text, 2 model, 3 aspect, 5 meta, 8 resolution
                return trim([text, r.modelKey, aspect, null, meta, null, null, res]);
            case 'references': // Q1a: 1 text, 2 images, 3 model, 4 aspect, 6 meta, 10 characters, 12 resolution
                return trim([
                    text,
                    r.imageIds?.length ? r.imageIds.map(imageRef) : null,
                    r.modelKey, aspect, null, meta, null, null, null,
                    r.characterIds?.length ? r.characterIds.map((id) => [id]) : null,
                    null, res,
                ]);
            case 'start_frame': // b2a: 1 text, 2 model, 3 aspect, 5 start image, 6 meta, 10 resolution
                return trim([text, r.modelKey, aspect, null, imageRef(r.startImageId), meta, null, null, null, res]);
            case 'start_end_frames': // W1a: 1 text, 2 model, 3 aspect, 5 first, 6 last, 7 meta
                return trim([text, r.modelKey, aspect, null, imageRef(r.startImageId), imageRef(r.endImageId), meta]);
        }
    });
    return [items, clientContext(r.projectId, r.token), [r.uuid(), 2]];
}
export function editVideoPayload(r) {
    // E1a: 1 source [.., mediaId, startFrame, endFrame], 2 text, 3 model, 4 aspect, 5 meta, 13 resolution
    const item = [
        [null, r.sourceMediaId, r.startFrame ?? 0, r.endFrame],
        textInput(r.prompt), r.modelKey, VIDEO_ASPECT[r.aspect], itemMeta(r.uuid),
        null, null, null, null, null, null, null, resMsg(r.resolution),
    ];
    return [[trim(item)], clientContext(r.projectId, r.token), [r.uuid(), 2]];
}
export function parseVideoJobs(data) {
    const workflows = data?.[2] ?? [];
    const media = data?.[3] ?? [];
    const jobs = media.map((m, i) => ({
        mediaId: m[0],
        workflowId: m[2] ?? workflows[i]?.[0],
        caption: workflows[i]?.[3]?.[0],
    }));
    return { jobs, creditsLeft: typeof data?.[1] === 'number' ? data[1] : undefined };
}
export const videoStatusPayload = (mediaIds) => [null, null, mediaIds.map((id) => [id])];
export function jobState(code) {
    // Observed: 6 -> 3 (manual edit), 2 -> 3 (agent r2v). 3 = done with media. Other codes are treated as
    // still pending; real failures are detected from PUBLIC_ERROR_* strings in parseVideoStatus.
    if (code === 3)
        return 'succeeded';
    if (code === 6 || code === 1)
        return 'queued';
    if (code === 2)
        return 'processing';
    return 'unknown';
}
export function parseVideoStatus(data) {
    const items = (data?.[2] ?? []).map((m) => {
        const g = m?.[5] ?? [];
        const code = Array.isArray(g[8]) ? g[8][0] : undefined;
        const err = JSON.stringify(m).match(/PUBLIC_ERROR_[A-Z_]+/)?.[0];
        return {
            mediaId: m[0], workflowId: m[2], state: err ? 'failed' : jobState(code), code, prompt: g[1],
            modelKey: g[6]?.[1]?.[0]?.[0], error: err,
        };
    });
    return { items, creditsLeft: typeof data?.[1] === 'number' ? data[1] : undefined };
}
// ---------------------------------------------------------------------------
// Media
export function findUrl(x, kind) {
    const s = JSON.stringify(x);
    const m = s.match(new RegExp(`https://flow-content\\.google/${kind}/[^"\\\\]+`));
    return m ? m[0].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&') : undefined;
}
export function parseMedia(data) {
    return {
        mediaId: data?.[0],
        projectId: data?.[1],
        workflowId: data?.[2],
        prompt: str(genInfo(data)?.[7]) ?? str(data?.[5]?.[1]),
        videoUrl: findUrl(data, 'video'),
        imageUrl: findUrl(data, 'image'),
        dimensions: (() => { const d = [data?.[7], data?.[8]].find((x) => Array.isArray(x) && typeof x[0] === 'number'); return d ? { width: d[0], height: d[1] } : undefined; })(),
    };
}
// ---------------------------------------------------------------------------
// Project contents (one call returns the whole project)
export function parseContents(data) {
    const workflows = (data?.[1] ?? []).map((w) => ({
        workflowId: w[0], caption: w[3]?.[0], mediaId: w[3]?.[4], characterId: w[5] ?? undefined, created: ts(w[3]?.[1]),
    }));
    const media = (data?.[2] ?? []).map((m) => ({
        mediaId: m[0], workflowId: m[2], prompt: str(genInfo(m)?.[7]) ?? str(m[5]?.[1]), caption: str(m[5]?.[1]),
        kind: findUrl(m, 'video') || /_(t2v|r2v|i2v|edit|extend)/.test(JSON.stringify(m)) ? 'video' : 'image',
    }));
    const voices = (data?.[3] ?? []).map((v) => ({ id: v[0], name: v[2], description: v[3]?.[10]?.[0]?.[1], sampleUrl: v[3]?.[10]?.[0]?.[3] }));
    const scenes = (data?.[4] ?? []).map((s) => ({ id: s[0], title: s[1], created: ts(s[3]), updated: ts(s[4]) }));
    const characters = (data?.[5] ?? []).map(parseEntity);
    const sceneClips = (data?.[6] ?? []).map((c) => ({
        sceneId: c[1], workflowId: c[0]?.[0], caption: c[0]?.[3]?.[0], mediaId: c[0]?.[3]?.[4], timing: c[2],
    }));
    const agent = parseAgentInfo(data?.[7]);
    return { workflows, media, voices, scenes, characters, sceneClips, agent };
}
export function parseAgentInfo(a) {
    const brief = a?.[1];
    const instructions = (brief?.[1] ?? []).map((i) => ({ id: i[0], title: i[1] ?? '', text: i[2] ?? '', active: !!i[3] }));
    return {
        instructionsEnabled: brief ? !!brief[0] : false,
        instructions,
        creditSpendApproval: a?.[3] === 2 ? 'auto_approve' : 'always_ask',
        rawDefaults: a?.[2],
    };
}
export function setInstructionsPayload(projectId, list, enabled = true) {
    return [projectName(projectId), [null, [enabled ? 1 : 0, list.map((i) => [i.id, i.title, i.text, i.active ? 1 : 0])]], [['project_brief']]];
}
export function imageDefaultsPayload(projectId, aspect, count, model) {
    return [projectName(projectId), [null, null, [[null, IMAGE_ASPECT[aspect], count, model]]], [['default_generation_settings.image_defaults']]];
}
export function videoDefaultsPayload(projectId, model, aspect, count) {
    return [projectName(projectId), [null, null, [null, [model, VIDEO_ASPECT[aspect], count]]], [['default_generation_settings.video_defaults']]];
}
export function approvalPolicyPayload(projectId, policy) {
    return [projectName(projectId), [null, null, null, APPROVAL_POLICY[policy]], [['credit_spend_approval_policy']]];
}
// ---------------------------------------------------------------------------
// Scenes
export const createScenePayload = (projectId) => [projectName(projectId), null, null, null, 2];
export const parseCreatedScene = (data) => ({ id: data?.[0]?.[0], title: data?.[0]?.[1] });
export const addToScenePayload = (projectId, sceneId, workflowIds, index) => [projectId, sceneId, workflowIds, index];
export function parseAddedClips(data) {
    const clips = (data?.[0] ?? []).map((c) => ({ workflowId: c[0]?.[0], mediaId: c[0]?.[3]?.[4], caption: c[0]?.[3]?.[0], timing: c[2] }));
    return clips;
}
const RES_NAME = { 4: '360p', 1: '720p', 2: '1080p', 3: '4k' };
export function parseModels(data) {
    const out = [];
    // Response: [[defaults, null, tierDefaults, displayNames, families, ...]]; older builds had families at data[2].
    const families = findFamilies(data);
    for (const fam of families) {
        const family = fam?.[0];
        for (const m of fam?.[1] ?? []) {
            const key = m?.[0];
            if (typeof key !== 'string')
                continue;
            // m[4] = [[tier, [[null, credits]]], ...]; price differs by subscription tier, so quote the highest.
            const prices = (m?.[4] ?? []).map((t) => t?.[1]?.[0]?.[1]).filter((n) => typeof n === 'number');
            const credits = prices.length ? Math.max(...prices) : undefined;
            const res = m?.[23]?.[0]?.[0];
            out.push({
                key, family, familyKey: fam?.[3], mode: modeOf(key),
                durationSec: typeof m?.[16] === 'number' ? m[16] : undefined,
                resolution: typeof res === 'number' ? RES_NAME[res] : undefined,
                credits: typeof credits === 'number' ? credits : undefined,
            });
        }
    }
    return out;
}
/** A model family looks like [displayName, [[modelKey, ...], ...], bool, familyKey?, ...]. Find the list of them. */
function findFamilies(data) {
    const isFamily = (f) => Array.isArray(f) && typeof f[0] === 'string' && Array.isArray(f[1]) && Array.isArray(f[1][0]) && typeof f[1][0][0] === 'string' && Array.isArray(f[1][0][4]);
    const isList = (l) => Array.isArray(l) && l.length > 0 && l.every(isFamily);
    const stack = [data];
    while (stack.length) {
        const n = stack.shift();
        if (isList(n))
            return n;
        if (Array.isArray(n))
            for (const c of n)
                if (Array.isArray(c))
                    stack.push(c);
    }
    return [];
}
function modeOf(key) {
    if (/first_last|start_end|_fl(_|$)/.test(key))
        return 'start_end_frames';
    if (/upsampl/.test(key))
        return 'upsample';
    if (/_r2v/.test(key))
        return 'references';
    if (/_i2v/.test(key))
        return 'start_frame';
    if (/_edit/.test(key))
        return 'edit';
    if (/extend/.test(key))
        return 'extend';
    if (/_t2v/.test(key))
        return 'text';
    return 'other';
}
// ---------------------------------------------------------------------------
// Agent chat (FlowCreationAgentService.StreamChat)
export const createSessionPayload = (projectId, uuid) => [projectId, null, uuid()];
export const parseSessionId = (data) => data?.[0]?.[0];
export const parseSessions = (data) => (data?.[0] ?? []).map((s) => ({ id: s[0], title: s[1]?.[0], updated: ts(s[1]?.[2]) }));
/** A new user message (mode 1). `characterIds` become @-mentions. */
export function chatMessagePayload(projectId, sessionId, text, token, characterIds = []) {
    const msg = [[[[text]]], null, null];
    if (characterIds.length)
        msg.push(characterIds.map((id) => [id]));
    return [sessionId, msg, [projectName(projectId), null, [token, 1], null, null, 1]];
}
/** Answer a pending ask_for_permission (mode 2). */
export function chatPermissionPayload(projectId, sessionId, answer, token) {
    return [sessionId, [[[[answer]]]], [projectName(projectId), null, [token, 1], null, null, 2], null, 1];
}
/** Decode a proto Value-ish arg: [null, number] | [null, null, string] | [..., list] */
function argValue(v) {
    if (!Array.isArray(v))
        return v;
    if (typeof v[1] === 'number')
        return v[1];
    if (typeof v[2] === 'string')
        return v[2];
    if (typeof v[3] === 'boolean')
        return v[3];
    if (Array.isArray(v[5]))
        return (v[5][0] ?? []).map((x) => argValue(x));
    return v;
}
export function parseAgentChunks(chunks) {
    const turn = { text: '', thinking: '', toolCalls: [], generatedMediaIds: [] };
    const seenThinking = new Set();
    let rawText = '';
    const walk = (node) => {
        if (!Array.isArray(node))
            return;
        // tool call: [id, null, null, [name, name, [[[arg, value], ...]]]] or with extra null
        for (const cand of [node[3], node[4]]) {
            if (Array.isArray(cand) && typeof cand[0] === 'string' && cand[0] === cand[1] && Array.isArray(cand[2])) {
                const args = {};
                for (const kv of cand[2]?.[0] ?? [])
                    if (Array.isArray(kv) && typeof kv[0] === 'string')
                        args[kv[0]] = argValue(kv[1]);
                turn.toolCalls.push({ name: cand[0], args });
                if (cand[0] === 'ask_for_permission') {
                    turn.permissionRequest = { totalCost: args.total_cost, numVideos: args.num_videos, numImages: args.num_images };
                }
                if (typeof args.media_id === 'string' && !turn.generatedMediaIds.includes(args.media_id))
                    turn.generatedMediaIds.push(args.media_id);
            }
        }
        // text part: ["text", [null, null, "..."]]
        if (node[0] === 'text' && Array.isArray(node[1]) && typeof node[1][2] === 'string') {
            rawText += node[1][2];
            return;
        }
        // thinking: [msgId, null, ["...thinking..."]]
        if (typeof node[0] === 'string' && node[1] === null && Array.isArray(node[2]) && typeof node[2][0] === 'string' && node[2].length === 1) {
            const t = node[2][0];
            if (!seenThinking.has(t)) {
                seenThinking.add(t);
                turn.thinking += t;
            }
        }
        for (const child of node)
            walk(child);
    };
    for (const c of chunks)
        walk(c);
    turn.text = extractA2uiText(rawText);
    return turn;
}
/** The agent answers in A2UI JSON inside ```json fences; pull out human-readable strings. */
function extractA2uiText(raw) {
    const blocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
    const plain = raw.replace(/```json[\s\S]*?```/g, '').trim();
    const out = plain ? [plain] : [];
    for (const b of blocks) {
        try {
            const walk = (n, key) => {
                if (Array.isArray(n))
                    return n.forEach((x) => walk(x));
                if (n && typeof n === 'object') {
                    for (const [k, v] of Object.entries(n)) {
                        if (k === 'literalString' && typeof v === 'string' && key && /text|label|description|title/i.test(key) && !/^[0-9a-f-]{36}$/.test(v))
                            out.push(v);
                        else
                            walk(v, k === 'literalString' ? key : k);
                    }
                }
            };
            walk(JSON.parse(b));
        }
        catch { /* partial */ }
    }
    return [...new Set(out)].join('\n');
}
// ---------------------------------------------------------------------------
function trim(a) {
    let n = a.length;
    while (n > 0 && (a[n - 1] === null || a[n - 1] === undefined))
        n--;
    return a.slice(0, n);
}
