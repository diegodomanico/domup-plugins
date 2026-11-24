import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export const defaultOutDir = () => process.env.FLOW_OUTPUT_DIR || join(homedir(), 'FlowExports');
export async function downloadTo(url, fileName, outDir) {
    const dir = resolve(outDir ?? defaultOutDir());
    mkdirSync(dir, { recursive: true });
    const path = join(dir, fileName);
    const r = await fetch(url);
    if (!r.ok || !r.body)
        throw new Error(`Download failed (${r.status}) for ${url.split('?')[0]}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(path));
    return path;
}
function run(cmd, args) {
    return new Promise((res, rej) => {
        const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (err += d));
        p.on('error', (e) => rej(new Error(`${cmd} not available: ${e.message}. Install ffmpeg and make sure it is on PATH.`)));
        p.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
    });
}
async function probe(path) {
    const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', path]);
    const streams = JSON.parse(out).streams;
    const v = streams.find((s) => s.codec_type === 'video');
    return { width: v?.width ?? 720, height: v?.height ?? 1280, hasAudio: streams.some((s) => s.codec_type === 'audio') };
}
/**
 * Join clips into one MP4. Each clip is normalised (size, 24 fps, stereo AAC,
 * silent track added where missing) so clips from different models concatenate
 * cleanly.
 */
export async function exportScene(urls, o) {
    const work = join(tmpdir(), `flow-mcp-${Date.now()}`);
    mkdirSync(work, { recursive: true });
    const raw = await Promise.all(urls.map((u, i) => downloadTo(u, `clip${String(i).padStart(3, '0')}.mp4`, work)));
    const first = await probe(raw[0]);
    const W = o.width ?? first.width;
    const H = o.height ?? first.height;
    const norm = [];
    for (const [i, f] of raw.entries()) {
        const info = await probe(f);
        const out = join(work, `norm${String(i).padStart(3, '0')}.mp4`);
        const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`;
        const args = info.hasAudio
            ? ['-y', '-i', f, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-video_track_timescale', '24000', '-c:a', 'aac', '-ar', '48000', '-ac', '2', out]
            : ['-y', '-i', f, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-video_track_timescale', '24000', '-c:a', 'aac', '-ar', '48000', '-ac', '2', out];
        await run('ffmpeg', args);
        norm.push(out);
    }
    const list = join(work, 'list.txt');
    writeFileSync(list, norm.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const dir = resolve(o.outDir ?? defaultOutDir());
    mkdirSync(dir, { recursive: true });
    const outPath = join(dir, `${o.name}.mp4`);
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outPath]);
    return { path: outPath, clips: urls.length, width: W, height: H };
}
