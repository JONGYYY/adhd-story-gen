const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');

console.log('Railway backend script started.'); // Added log

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Attempting to start server on port: ${PORT}`); // Added log

// In-memory video status storage (for simplicity)
const videoStatus = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Ensure videos directory exists
async function ensureVideosDir() {
  const videosDir = path.join(__dirname, 'public', 'videos');
  await fsp.mkdir(videosDir, { recursive: true });
  return videosDir;
}

// Pick a sample background mp4 to copy (kept for reference/local assets)
async function resolveSampleMp4(preferredCategory) {
  const backgroundsRoot = path.join(__dirname, 'public', 'backgrounds');
  // Prefer smaller samples first to reduce copy time
  const orderedBySizeGuess = [
    'subway', 'asmr', 'cooking', 'workers', preferredCategory, 'minecraft'
  ].filter(Boolean);
  const seen = new Set();
  const candidates = orderedBySizeGuess.filter((c) => { if (seen.has(c)) return false; seen.add(c); return true; });
  for (const cat of candidates) {
    const candidate = path.join(backgroundsRoot, cat, '1.mp4');
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const dirs = await fsp.readdir(backgroundsRoot);
    for (const dir of dirs) {
      const candidate = path.join(backgroundsRoot, dir, '1.mp4');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (e) {
    console.error('Failed to scan backgrounds directory:', e);
  }
  return null;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check requested.'); // Added log
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    service: 'railway-video-backend'
  });
});

// Root route: show basic info (avoid accidental redirects)
const FRONTEND_URL = process.env.FRONTEND_URL;
app.get('/', (req, res) => {
  res.status(200).send(
    FRONTEND_URL
      ? `StoryGen worker is running. Visit frontend at ${FRONTEND_URL}. Endpoints: /generate-video, /api/health.`
      : 'StoryGen worker is running. Endpoints: /generate-video, /api/health.'
  );
});

// External background mapping (replace with your own CDN later)
const EXTERNAL_BG = {
  minecraft: process.env.BG_MINECRAFT_URL || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  subway: process.env.BG_SUBWAY_URL || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  cooking: process.env.BG_COOKING_URL || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  workers: process.env.BG_WORKERS_URL || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  asmr: process.env.BG_ASMR_URL || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  random: process.env.BG_RANDOM_URL || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
};

// ElevenLabs
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_IDS = {
  brian: 'ThT5KcBeYPX3keUQqHPh',
  adam: 'pNInz6obpgDQGcFmaJgB',
  antoni: 'ErXwobaYiN019PkySvjV',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  laura: 'pFZP5JQG7iQjIQuC4Bku',
  rachel: '21m00Tcm4TlvDq8ikWAM'
};

async function synthesizeVoiceEleven(text, voiceAlias) {
  if (!ELEVENLABS_API_KEY || !voiceAlias || !VOICE_IDS[voiceAlias]) {
    console.warn('TTS disabled or voice not found. Skipping.');
    return null;
  }
  const voiceId = VOICE_IDS[voiceAlias];
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ElevenLabs error ${resp.status}: ${t}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf;
}

// Helpers to get audio duration with ffprobe and build word timestamps
async function getAudioDurationFromFile(audioPath) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const ffprobe = spawn('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath]);
    let output = '';
    ffprobe.stdout.on('data', (d) => (output += d.toString()));
    ffprobe.on('close', (code) => {
      if (code === 0) resolve(parseFloat(output.trim()));
      else reject(new Error(`ffprobe failed with code ${code}`));
    });
    ffprobe.on('error', reject);
  });
}

function buildWordTimestamps(totalDuration, text) {
  const words = (text || '').split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0 || !isFinite(totalDuration) || totalDuration <= 0) return [];
  const avg = totalDuration / words.length;
  return words.map((w, i) => ({ text: w, start: i * avg, end: (i + 1) * avg }));
}

async function buildVideoWithFfmpeg({ title, story, backgroundCategory, voiceAlias }, videoId) {
  const videosDir = await ensureVideosDir();
  const outPath = path.join(videosDir, `${videoId}.mp4`);

  // Resolve BG (remote env URL preferred, else local public/backgrounds/<cat>/1.mp4, else fallback)
  function resolveLocalBg(category) {
    const p = path.join(__dirname, 'public', 'backgrounds', category, '1.mp4');
    return fs.existsSync(p) ? p : null;
  }
  const preferredRemote = EXTERNAL_BG[backgroundCategory] || null;
  let bgPath;
  const tmpDir = path.join(__dirname, 'tmp');
  await fsp.mkdir(tmpDir, { recursive: true });
  if (preferredRemote && preferredRemote.startsWith('http')) {
    bgPath = path.join(tmpDir, `bg-${videoId}.mp4`);
    const bgRes = await fetch(preferredRemote);
    const bgBuf = Buffer.from(await bgRes.arrayBuffer());
    await fsp.writeFile(bgPath, bgBuf);
  } else {
    bgPath = resolveLocalBg(backgroundCategory) || resolveLocalBg('subway') || resolveLocalBg('minecraft');
    if (!bgPath) {
      bgPath = path.join(tmpDir, `bg-${videoId}.mp4`);
      const fallback = EXTERNAL_BG.random;
      const bgRes = await fetch(fallback);
      const bgBuf = Buffer.from(await bgRes.arrayBuffer());
      await fsp.writeFile(bgPath, bgBuf);
    }
  }

  // Synthesize TTS for title and story segments
  const openingText = title || '';
  const storyText = (story || '').split('[BREAK]')[0].trim() || story || '';
  const openingBuf = await synthesizeVoiceEleven(openingText, voiceAlias).catch(() => null);
  const storyBuf = await synthesizeVoiceEleven(storyText, voiceAlias).catch(() => null);

  // Write audio to files
  const openingAudio = path.join(tmpDir, `open-${videoId}.mp3`);
  const storyAudio = path.join(tmpDir, `story-${videoId}.mp3`);
  if (openingBuf) await fsp.writeFile(openingAudio, openingBuf);
  if (storyBuf) await fsp.writeFile(storyAudio, storyBuf);

  // Durations
  const openingDur = openingBuf ? await getAudioDurationFromFile(openingAudio) : 0.8;
  const storyDur = storyBuf ? await getAudioDurationFromFile(storyAudio) : 3.0;

  // Word timestamps for captions
  const wordTimestamps = buildWordTimestamps(storyDur, storyText);

  // Banner image (overlay during opening). Prefer centered card asset
  let bannerPath = path.join(__dirname, 'public', 'banners', 'redditbannerbottom.png');
  if (!fs.existsSync(bannerPath)) {
    bannerPath = path.join(__dirname, 'public', 'banners', 'redditbannertop.png');
  }

  // Font fallback
  let fontPath = '';
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Windows/Fonts/arial.ttf'
  ];
  for (const f of candidates) {
    try { if (fs.existsSync(f)) { fontPath = f; break; } } catch {}
  }

  const { spawn } = require('child_process');

  // Build filter_complex: scale+crop to 1080x1920, overlay banner during opening, draw per-word captions.
  let filter = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=0.05:contrast=1.1:saturation=1.1[bg];`;
  const bannerExists = fs.existsSync(bannerPath);
  if (bannerExists) {
    // Scale banner and center slightly lower than midpoint during opening
    filter += `[1:v]scale=900:-1[banner];[bg][banner]overlay=(main_w-w)/2:(main_h-h)/2+120:enable='between(t,0,${openingDur.toFixed(2)})'[v0]`;
  } else {
    filter += `[bg]null[v0]`;
  }
  let current = 'v0';
  wordTimestamps.forEach((w, i) => {
    const st = (openingDur + w.start).toFixed(2);
    const en = (openingDur + w.end).toFixed(2);
    const txt = (w.text || '').replace(/'/g, "\\'").replace(/:/g, '\\:');
    // Centered captions, no box; keep subtle shadow for contrast
    const draw = fontPath
      ? `drawtext=fontfile='${fontPath}':text='${txt.toUpperCase()}':fontsize=86:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${st},${en})':shadowx=3:shadowy=3:shadowcolor=black@0.8`
      : `drawtext=text='${txt.toUpperCase()}':fontsize=86:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${st},${en})':shadowx=3:shadowy=3:shadowcolor=black@0.8`;
    filter += `;[${current}]${draw}[t${i}]`;
    current = `t${i}`;
  });

  // Prepare inputs and determine indexes
  const args = ['-y', '-i', bgPath];
  let idx = 1;
  const bannerIdx = bannerExists ? idx++ : -1;
  const openingIdx = openingBuf ? idx++ : -1;
  const storyIdx = storyBuf ? idx++ : -1;
  if (bannerExists) args.push('-i', bannerPath);
  if (openingBuf) args.push('-i', openingAudio);
  if (storyBuf) args.push('-i', storyAudio);

  // Audio graph within the same filter_complex
  let haveAudio = false;
  if (openingIdx >= 0 && storyIdx >= 0) {
    haveAudio = true;
    filter += `;[${openingIdx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS[oa];` +
              `[${storyIdx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS[sa];` +
              `[oa][sa]concat=n=2:v=0:a=1[aout]`;
  } else if (openingIdx >= 0) {
    haveAudio = true;
    filter += `;[${openingIdx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS[aout]`;
  } else if (storyIdx >= 0) {
    haveAudio = true;
    filter += `;[${storyIdx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS[aout]`;
  }

  // Apply single filter_complex and proper mapping
  args.push(
    '-filter_complex', filter,
    '-map', `[${current}]`
  );
  if (haveAudio) args.push('-map', '[aout]');

  args.push(
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-r', '30', '-pix_fmt', 'yuv420p', '-shortest', outPath
  );

  console.log('FFMPEG FILTER_COMPLEX =>', filter);
  console.log('FFMPEG ARGS =>', JSON.stringify(args));

  try {
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', args);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d.toString(); });
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed ${code}: ${stderr}`)));
    });
  } catch (err) {
    console.error('Primary ffmpeg graph failed, falling back to simple compose:', err.message);
    // Fallback: background + concatenated audio, no banner/captions
    const fallbackArgs = ['-y', '-i', bgPath];
    let fallbackAudioIdx = -1;
    if (openingBuf) { fallbackArgs.push('-i', openingAudio); fallbackAudioIdx = 1; }
    if (storyBuf) { fallbackArgs.push('-i', storyAudio); }

    const audioInputs = openingBuf && storyBuf ? ['1:a', '2:a'] : (openingBuf ? ['1:a'] : (storyBuf ? ['1:a'] : []));
    const fallbackFilter = audioInputs.length === 2
      ? `[${audioInputs[0]}]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100[oa];[${audioInputs[1]}]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100[sa];[oa][sa]concat=n=2:v=0:a=1[aout]`
      : (audioInputs.length === 1 ? `[${audioInputs[0]}]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100[aout]` : 'anullsrc');

    if (audioInputs.length > 0) {
      fallbackArgs.push('-filter_complex', fallbackFilter, '-map', '0:v', '-map', '[aout]');
    } else {
      fallbackArgs.push('-map', '0:v');
    }

    fallbackArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-r', '30', '-pix_fmt', 'yuv420p', '-shortest', outPath);

    console.log('FFMPEG FALLBACK FILTER =>', fallbackFilter);
    console.log('FFMPEG FALLBACK ARGS =>', JSON.stringify(fallbackArgs));

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', fallbackArgs);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d.toString(); });
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`fallback ffmpeg failed ${code}: ${stderr}`)));
    });
  }

  return `/videos/${videoId}.mp4`;
}

// Simple video generation function
async function generateVideoSimple(options, videoId) {
  console.log(`Generating video for ID: ${videoId} with options:`, options); // Added log
  videoStatus.set(videoId, { status: 'processing', progress: 0, message: 'Video generation started.' });

  await new Promise((r) => setTimeout(r, 300));
  videoStatus.set(videoId, { status: 'processing', progress: 25, message: 'Generating voice-over...' });
  await new Promise((r) => setTimeout(r, 300));
  videoStatus.set(videoId, { status: 'processing', progress: 50, message: 'Compositing video...' });
  await new Promise((r) => setTimeout(r, 300));
  videoStatus.set(videoId, { status: 'processing', progress: 75, message: 'Finalizing...' });

  try {
    const videoUrl = await buildVideoWithFfmpeg({
      title: options?.customStory?.title,
      story: options?.customStory?.story,
      backgroundCategory: options?.background?.category || 'random',
      voiceAlias: options?.voice?.id
    }, videoId);

    videoStatus.set(videoId, { status: 'completed', progress: 100, message: 'Video generation complete.', videoUrl });
    console.log(`Video generation completed for ID: ${videoId}`);
  } catch (err) {
    console.error('Video build failed:', err);
    videoStatus.set(videoId, { status: 'failed', error: 'Video build failed' });
  }
}

// Always try to build efficient generator at startup with esbuild, then require it
let efficient;
try {
  const esbuild = require('esbuild');
  console.log('Building efficient generator bundle...');
  esbuild.buildSync({
    entryPoints: ['src/lib/video-generator/efficient-generator.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/efficient-generator.js',
    sourcemap: false
  });
  efficient = require('./dist/efficient-generator.js');
  console.log('Efficient generator built and loaded');
} catch (err) {
  try {
    console.warn('Build failed or esbuild missing, trying to load existing bundle:', err?.message);
    efficient = require('./dist/efficient-generator.js');
    console.log('Efficient generator loaded from existing bundle');
  } catch (e2) {
    console.warn('Efficient generator not available; using inline composer');
    efficient = null;
  }
}

// Video generation endpoint
app.post('/generate-video', async (req, res) => {
	try {
		console.log('Received video generation request.'); // Added log
		const { customStory, voice, background, isCliffhanger } = req.body;
		const videoId = uuidv4();

		// Set initial processing status so /video-status does not 404
		videoStatus.set(videoId, { status: 'processing', progress: 0, message: 'Video generation started.' });

		// Start video generation in the background
		(async () => {
			try {
				if (efficient && efficient.generateVideo) {
					console.log('Using efficient generator pipeline');
					const tmpOutputPath = await efficient.generateVideo({
						story: { title: customStory?.title || '', story: customStory?.story || '', subreddit: customStory?.subreddit || 'r/stories', author: customStory?.author || 'Anonymous' },
						voice,
						background,
						isCliffhanger
					}, videoId);
					// Move/copy final file into public/videos so it can be served
					const videosDir = await ensureVideosDir();
					const finalPath = path.join(videosDir, `${videoId}.mp4`);
					try {
						await fsp.copyFile(tmpOutputPath, finalPath);
					} catch (copyErr) {
						console.warn('Copy tmp output failed, attempting rename:', copyErr?.message);
						try { await fsp.rename(tmpOutputPath, finalPath); } catch (renameErr) { console.error('Rename also failed:', renameErr?.message); }
					}
					videoStatus.set(videoId, { status: 'completed', progress: 100, message: 'Video generation complete.', videoUrl: `/videos/${videoId}.mp4` });
					return;
				}
				await generateVideoSimple({ customStory, voice, background, isCliffhanger }, videoId);
			} catch (e) {
				console.error('Background generation failed:', e);
				videoStatus.set(videoId, { status: 'failed', error: 'Video build failed' });
			}
		})();

		res.status(202).json({ success: true, message: 'Video generation started.', videoId, statusUrl: `/video-status/${videoId}` });
	} catch (error) {
		console.error('Video generation error:', error); // Added log
		res.status(500).json({ success: false, error: error.message || 'Failed to start video generation' });
	}
});

// Video status endpoint
app.get('/video-status/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    console.log(`Video status requested for ID: ${videoId}`); // Added log
    const status = videoStatus.get(videoId);

    if (!status) {
      return res.status(404).json({ success: false, error: 'Video ID not found.' });
    }

    res.json(status);
  } catch (error) {
    console.error('Video status error:', error); // Added log
    res.status(500).json({ success: false, error: error.message || 'Failed to get video status' });
  }
});

// Serve generated videos
app.get('/videos/:filename', (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(__dirname, 'public', 'videos', filename);
  
  if (fs.existsSync(videoPath)) {
    res.sendFile(videoPath);
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Railway backend server running on port ${PORT}`); // Added log
});

module.exports = app; 