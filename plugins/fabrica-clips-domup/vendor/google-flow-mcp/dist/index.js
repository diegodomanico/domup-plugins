#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { FlowBrowser, optionsFromEnv } from './browser.js';
import { FlowClient, FlowError } from './flow.js';
import { exportScene, downloadTo } from './export.js';
const browser = new FlowBrowser(optionsFromEnv());
const flow = new FlowClient(browser);
const DEFAULT_MAX_CREDITS = Number(process.env.FLOW_MAX_CREDITS_PER_CALL ?? 20);
const server = new McpServer({ name: 'google-flow', version: '0.2.0' }, {
    instructions: 'Unofficial tools for Google Flow (flow.google.com), driven through a signed-in browser. Typical workflow: ' +
        'flow_list_projects -> flow_get_project -> flow_create_character -> flow_generate_video (character_ids) -> ' +
        'flow_video_status (wait) -> flow_create_scene -> flow_add_clips_to_scene -> flow_export_scene. ' +
        'Generation spends the user\'s Flow credits: every generating tool reads Flow\'s own quote first and refuses above max_credits. ' +
        'Use dry_run=true to see the quote without generating. Prefer 360p / 4s drafts. Generation runs through Flow\'s UI, one job at a time.',
});
const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] });
const wrap = (fn) => async (a) => { try {
    return ok(await fn(a));
}
catch (e) {
    return fail(e);
} };
const projectId = z.string().describe('Flow project id (from flow_list_projects).');
const videoAspect = z.enum(['16:9', '9:16']);
const imageAspect = z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']);
const maxCredits = z.number().int().min(0).optional().describe(`Refuse if Flow's quote exceeds this (default ${DEFAULT_MAX_CREDITS}).`);
// ------------------------------------------------------------------ session & account
server.registerTool('flow_status', {
    title: 'Flow session status',
    description: 'Check that the MCP browser is signed in to Flow and return the remaining credit balance.',
    inputSchema: {}, annotations: { readOnlyHint: true },
}, wrap(async () => ({ ...(await flow.status()), credits: await flow.credits() })));
server.registerTool('flow_list_models', {
    title: 'List Flow models',
    description: 'Video models with key, family, mode (text/references/start_frame/start_end_frames/edit/extend/upsample), duration, resolution and credit cost (highest tier price).',
    inputSchema: { mode: z.string().optional(), family: z.string().optional().describe('e.g. "Omni", "Veo 3.1 - Lite"') },
    annotations: { readOnlyHint: true },
}, wrap(async ({ mode, family }) => (await flow.models(true)).filter((m) => (!mode || m.mode === mode) && (!family || m.family.toLowerCase().includes(family.toLowerCase())))));
server.registerTool('flow_list_voices', {
    title: 'List character voices', description: 'Voices that can be assigned to a character.',
    inputSchema: { project_id: projectId }, annotations: { readOnlyHint: true },
}, wrap(async ({ project_id }) => (await flow.contents(project_id)).voices));
// ------------------------------------------------------------------ projects
server.registerTool('flow_list_projects', {
    title: 'List Flow projects', description: 'List the user\'s Flow projects.',
    inputSchema: {}, annotations: { readOnlyHint: true },
}, wrap(() => flow.listProjects()));
server.registerTool('flow_create_project', {
    title: 'Create Flow project', description: 'Create a new, empty Flow project.',
    inputSchema: { title: z.string() },
}, wrap(({ title }) => flow.createProject(title)));
server.registerTool('flow_get_project', {
    title: 'Get project contents',
    description: 'Characters, generations and media, scenes with their clips, agent instructions and generation defaults.',
    inputSchema: { project_id: projectId }, annotations: { readOnlyHint: true },
}, wrap(async ({ project_id }) => {
    const c = await flow.contents(project_id);
    const defaults = await flow.projectDefaults(project_id).catch(() => undefined);
    return {
        characters: c.characters,
        scenes: c.scenes.map((s) => ({ ...s, clips: c.sceneClips.filter((k) => k.sceneId === s.id) })),
        generations: c.workflows, media: c.media,
        agent: { instructions: c.agent.instructions, instructionsEnabled: c.agent.instructionsEnabled, ...defaults },
    };
}));
// ------------------------------------------------------------------ characters
server.registerTool('flow_create_character', {
    title: 'Create character',
    description: 'Create a reusable character. With portrait_prompt, Flow\'s character builder generates its look (Nano Banana, image credits). Also sets voice and personality notes the Flow agent uses.',
    inputSchema: {
        project_id: projectId, name: z.string(),
        portrait_prompt: z.string().optional().describe('How the character looks. Generates the portrait.'),
        voice: z.string().optional().describe('Voice id, e.g. "aoede" (flow_list_voices).'),
        personality: z.string().optional().describe('How the character acts and speaks.'),
    },
}, wrap(({ project_id, name, portrait_prompt, voice, personality }) => flow.createCharacter({ projectId: project_id, name, portraitPrompt: portrait_prompt, voice, personality })));
server.registerTool('flow_update_character', {
    title: 'Update character', description: 'Change a character\'s name, voice or personality notes.',
    inputSchema: { project_id: projectId, character_id: z.string(), name: z.string().optional(), voice: z.string().optional(), personality: z.string().optional() },
}, wrap(async ({ project_id, character_id, name, voice, personality }) => {
    let last;
    if (name !== undefined)
        last = await flow.updateCharacter(project_id, character_id, 'name', name);
    if (personality !== undefined)
        last = await flow.updateCharacter(project_id, character_id, 'personality', personality);
    if (voice !== undefined)
        last = await flow.updateCharacter(project_id, character_id, 'voice', voice);
    if (!last)
        throw new FlowError('Nothing to update: pass name, voice and/or personality.');
    return last;
}));
server.registerTool('flow_regenerate_portrait', {
    title: 'Change character look',
    description: 'Change an existing character\'s portrait with an instruction ("give her a red scarf"), in Flow\'s character editor.',
    inputSchema: { project_id: projectId, character_id: z.string(), prompt: z.string() },
}, wrap(({ project_id, character_id, prompt }) => flow.regeneratePortrait(project_id, character_id, prompt)));
// ------------------------------------------------------------------ images
server.registerTool('flow_generate_image', {
    title: 'Generate images',
    description: 'Generate images (Nano Banana) through Flow\'s composer, optionally with characters and reference images as ingredients.',
    inputSchema: {
        project_id: projectId, prompt: z.string(), aspect: imageAspect.default('16:9'),
        count: z.number().int().min(1).max(4).default(1),
        character_ids: z.array(z.string()).optional(), reference_media_ids: z.array(z.string()).optional(),
    },
}, wrap(({ project_id, prompt, aspect, count, character_ids, reference_media_ids }) => flow.generateImages({ projectId: project_id, prompt, aspect, count, characterIds: character_ids, referenceMediaIds: reference_media_ids })));
// ------------------------------------------------------------------ video
server.registerTool('flow_generate_video', {
    title: 'Generate video',
    description: 'Generate video clips through Flow\'s composer. character_ids / image_ids become ingredients (characters stay consistent). ' +
        'Choose a model by model_key or by family + duration_sec + resolution (Omni supports 360p/720p and 4-10s). ' +
        'SPENDS CREDITS: Flow\'s own quote is checked against max_credits first; dry_run=true returns the quote only.',
    inputSchema: {
        project_id: projectId, prompt: z.string(),
        character_ids: z.array(z.string()).optional().describe('Character ids (or names) to feature.'),
        image_ids: z.array(z.string()).optional().describe('Reference image media ids.'),
        model_key: z.string().optional().describe('Exact key from flow_list_models.'),
        family: z.string().optional().describe('"omni" (default), "Veo 3.1 - Lite", "Veo 3.1 - Fast", "Veo 3.1 - Quality".'),
        duration_sec: z.number().int().optional().describe('Omni: 4, 6, 8 or 10 (default 4).'),
        resolution: z.enum(['360p', '720p']).optional().describe('Omni only. 360p is the cheapest draft (default).'),
        aspect: videoAspect.default('9:16'),
        count: z.number().int().min(1).max(4).default(1),
        wait: z.boolean().default(false).describe('Block until the clips finish (up to 10 min).'),
        add_to_scene_id: z.string().optional().describe('Append finished clips to this scene (implies wait).'),
        max_credits: maxCredits,
        dry_run: z.boolean().default(false),
    },
}, wrap(async (a) => {
    const refs = !!(a.character_ids?.length || a.image_ids?.length);
    const fam = a.family ?? 'omni';
    const isOmni = /omni|abra/i.test(fam);
    const model = await flow.resolveVideoModel({
        modelKey: a.model_key, family: fam, mode: refs ? 'references' : 'text',
        durationSec: isOmni ? (a.duration_sec ?? 4) : a.duration_sec, resolution: isOmni ? (a.resolution ?? '360p') : undefined,
    });
    const res = await flow.generateVideo({
        projectId: a.project_id, prompt: a.prompt, model, aspect: a.aspect, count: a.count,
        characterIds: a.character_ids, imageIds: a.image_ids, maxCredits: a.max_credits ?? DEFAULT_MAX_CREDITS, dryRun: a.dry_run,
    });
    const out = { model: model.key, ...res };
    if (!a.dry_run && (a.wait || a.add_to_scene_id)) {
        const done = await flow.waitForVideos(res.jobs.map((j) => j.mediaId));
        out.result = done;
        if (a.add_to_scene_id) {
            const ok = res.jobs.filter((_, i) => done.items[i]?.state === 'succeeded').map((j) => j.workflowId).filter(Boolean);
            if (ok.length) {
                const c = await flow.contents(a.project_id);
                out.addedToScene = await flow.addToScene(a.project_id, a.add_to_scene_id, ok, c.sceneClips.filter((k) => k.sceneId === a.add_to_scene_id).length);
            }
        }
    }
    return out;
}));
server.registerTool('flow_edit_video', {
    title: 'Edit video',
    description: 'Edit an existing clip with an instruction. Flow uses an Omni edit model (costlier than generation). SPENDS CREDITS; quote checked against max_credits.',
    inputSchema: {
        project_id: projectId, media_id: z.string().describe('Video media id to edit.'), prompt: z.string(),
        character_ids: z.array(z.string()).optional(),
        resolution: z.enum(['360p', '720p']).default('360p'), aspect: videoAspect.default('9:16'),
        wait: z.boolean().default(false), max_credits: maxCredits, dry_run: z.boolean().default(false),
    },
}, wrap(async (a) => {
    const model = await flow.resolveVideoModel({ family: 'omni', mode: 'edit', resolution: a.resolution });
    const res = await flow.generateVideo({
        projectId: a.project_id, prompt: a.prompt, model: { ...model, durationSec: undefined }, aspect: a.aspect, count: 1,
        videoIds: [a.media_id], characterIds: a.character_ids, maxCredits: a.max_credits ?? DEFAULT_MAX_CREDITS, dryRun: a.dry_run,
    });
    if (!a.dry_run && a.wait)
        res.result = await flow.waitForVideos(res.jobs.map((j) => j.mediaId));
    return { model: model.key, ...res };
}));
server.registerTool('flow_video_status', {
    title: 'Video job status',
    description: 'Check (or wait for) video jobs. Succeeded items include a signed video URL (valid a few hours).',
    inputSchema: { media_ids: z.array(z.string()).min(1), wait: z.boolean().default(false), timeout_sec: z.number().default(600) },
    annotations: { readOnlyHint: true },
}, wrap(({ media_ids, wait, timeout_sec }) => wait ? flow.waitForVideos(media_ids, timeout_sec) : flow.videoStatus(media_ids)));
server.registerTool('flow_get_media', {
    title: 'Get media', description: 'An image or video with a fresh signed URL.',
    inputSchema: { media_id: z.string() }, annotations: { readOnlyHint: true },
}, wrap(({ media_id }) => flow.getMedia(media_id)));
server.registerTool('flow_download_media', {
    title: 'Download media', description: 'Download an image or video to a local file. Returns the path.',
    inputSchema: { media_id: z.string(), out_dir: z.string().optional() },
}, wrap(async ({ media_id, out_dir }) => {
    const m = await flow.getMedia(media_id);
    const url = m.videoUrl ?? m.imageUrl;
    if (!url)
        throw new FlowError('This media has no downloadable URL yet (still generating?).');
    return { path: await downloadTo(url, media_id + (m.videoUrl ? '.mp4' : '.png'), out_dir) };
}));
// ------------------------------------------------------------------ scenes
server.registerTool('flow_create_scene', {
    title: 'Create scene', description: 'Create an empty scene (timeline) in a project.',
    inputSchema: { project_id: projectId },
}, wrap(({ project_id }) => flow.createScene(project_id)));
server.registerTool('flow_add_clips_to_scene', {
    title: 'Add clips to scene',
    description: 'Place videos on a scene timeline, in order. Accepts media ids or generation (workflow) ids. Appends by default.',
    inputSchema: { project_id: projectId, scene_id: z.string(), ids: z.array(z.string()).min(1), index: z.number().int().min(0).optional() },
}, wrap(async ({ project_id, scene_id, ids, index }) => {
    const wf = await flow.workflowIdsFor(project_id, ids);
    const c = await flow.contents(project_id);
    return flow.addToScene(project_id, scene_id, wf, index ?? c.sceneClips.filter((k) => k.sceneId === scene_id).length);
}));
server.registerTool('flow_export_scene', {
    title: 'Export scene',
    description: 'Combine a scene\'s clips into one MP4 on this machine (downloads each clip; ffmpeg normalises size, fps and audio, then joins). Returns the path.',
    inputSchema: { project_id: projectId, scene_id: z.string(), out_dir: z.string().optional(), width: z.number().int().optional(), height: z.number().int().optional() },
}, wrap(async ({ project_id, scene_id, out_dir, width, height }) => {
    const c = await flow.contents(project_id);
    const clips = c.sceneClips.filter((k) => k.sceneId === scene_id);
    if (!clips.length)
        throw new FlowError('Scene has no clips.');
    const urls = [];
    for (const k of clips) {
        const m = await flow.getMedia(k.mediaId);
        if (!m.videoUrl)
            throw new FlowError(`Clip ${k.mediaId} has no video URL (still generating?).`);
        urls.push(m.videoUrl);
    }
    return exportScene(urls, { outDir: out_dir, name: `scene-${scene_id}`, width, height });
}));
// ------------------------------------------------------------------ agent
server.registerTool('flow_agent_chat', {
    title: 'Chat with the Flow agent',
    description: 'Send a message to Flow\'s creative agent (brainstorms, writes prompts, generates). character_ids are attached as mentions. ' +
        'If it asks to spend credits it is approved only when the quoted cost <= max_credits (default 0 = never); otherwise it stays pending for flow_agent_respond.',
    inputSchema: {
        project_id: projectId, message: z.string(), new_session: z.boolean().default(false),
        character_ids: z.array(z.string()).optional(), image_ids: z.array(z.string()).optional().describe('Reference image media ids to attach (LOCAL PATCH).'), max_credits: z.number().int().min(0).default(0),
    },
}, wrap(({ project_id, message, new_session, character_ids, image_ids, max_credits }) => flow.agentChat({ projectId: project_id, message, newSession: new_session, characterIds: character_ids, imageIds: image_ids, maxCredits: max_credits })));
server.registerTool('flow_agent_respond', {
    title: 'Answer agent permission request', description: 'Approve or reject the agent\'s pending request to spend credits.',
    inputSchema: { project_id: projectId, answer: z.enum(['Approve', 'Reject']) },
}, wrap(({ project_id, answer }) => flow.agentAnswerPermission(project_id, answer)));
server.registerTool('flow_list_agent_sessions', {
    title: 'List agent sessions', description: 'Flow agent chat sessions in a project.',
    inputSchema: { project_id: projectId }, annotations: { readOnlyHint: true },
}, wrap(({ project_id }) => flow.listSessions(project_id)));
// ------------------------------------------------------------------ instructions & defaults
server.registerTool('flow_set_agent_instructions', {
    title: 'Set agent instructions',
    description: 'Project "Agent instructions" (guidelines Flow\'s agent follows: style, format, tone). mode "add" appends, "replace" sets the list, "remove" deletes by id or title.',
    inputSchema: {
        project_id: projectId, mode: z.enum(['replace', 'add', 'remove']).default('add'),
        instructions: z.array(z.object({ id: z.string().optional(), title: z.string(), text: z.string().default(''), active: z.boolean().default(true) })).default([]),
        enabled: z.boolean().default(true),
    },
}, wrap(async ({ project_id, mode, instructions, enabled }) => {
    const current = (await flow.contents(project_id)).agent.instructions;
    const norm = instructions.map((i) => ({ id: i.id ?? crypto.randomUUID().toUpperCase(), title: i.title, text: i.text, active: i.active }));
    const next = mode === 'replace' ? norm : mode === 'add' ? [...current, ...norm]
        : current.filter((c) => !instructions.some((i) => (i.id && i.id === c.id) || i.title === c.title));
    return flow.setInstructions(project_id, next, enabled);
}));
server.registerTool('flow_set_generation_defaults', {
    title: 'Set generation defaults',
    description: 'Model defaults the agent uses (image aspect/count/model, video model/aspect/count) and whether it must ask before spending credits.',
    inputSchema: {
        project_id: projectId,
        image: z.object({ aspect: imageAspect, count: z.number().int().min(1).max(4), model: z.string().default('narwhal_display') }).optional(),
        video: z.object({ model: z.string().describe('Family key: "abra" (Omni), "veo_3_1_lite", "veo_3_1_fast", "veo_3_1_quality".'), aspect: videoAspect, count: z.number().int().min(1).max(4) }).optional(),
        credit_spend_approval: z.enum(['always_ask', 'auto_approve']).optional(),
    },
}, wrap(async ({ project_id, image, video, credit_spend_approval }) => {
    if (image)
        await flow.setImageDefaults(project_id, image.aspect, image.count, image.model);
    if (video)
        await flow.setVideoDefaults(project_id, video.model, video.aspect, video.count);
    if (credit_spend_approval)
        await flow.setApprovalPolicy(project_id, credit_spend_approval);
    return flow.projectDefaults(project_id);
}));
// ------------------------------------------------------------------ start
await server.connect(new StdioServerTransport());
const shutdown = async () => { await browser.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
