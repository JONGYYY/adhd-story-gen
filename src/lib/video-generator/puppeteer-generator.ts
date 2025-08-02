import puppeteer from 'puppeteer';
import { VideoGenerationOptions } from './types';
import { generateSpeech, getAudioDuration } from './voice';
import { updateProgress } from './status';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { spawn } from 'child_process';

interface WordTimestamp {
  text: string;
  start: number;
  end: number;
}

export async function generateVideo(
  options: VideoGenerationOptions,
  videoId: string
): Promise<string> {
  let browser: puppeteer.Browser | null = null;
  const tempFiles: string[] = [];

  try {
    console.log('Starting Puppeteer video generation...');
    await updateProgress(videoId, 10);

    // Create temp directory
    const tmpDir = os.tmpdir();
    const workingDir = path.join(tmpDir, `video_${videoId}`);
    await fs.mkdir(workingDir, { recursive: true });

    // Generate speech for opening (title) and story
    console.log('Generating speech...');
    const openingText = `${options.story.title}`;
    const storyText = options.story.story.split('[BREAK]')[0].trim();

    const openingAudioPath = path.join(workingDir, 'opening.mp3');
    const storyAudioPath = path.join(workingDir, 'story.mp3');

    await generateSpeech(openingText, options.voice.id, openingAudioPath);
    await generateSpeech(storyText, options.voice.id, storyAudioPath);

    tempFiles.push(openingAudioPath, storyAudioPath);

    const openingDuration = await getAudioDuration(openingAudioPath);
    const storyDuration = await getAudioDuration(storyAudioPath);

    await updateProgress(videoId, 25);

    // Get word timestamps for captions
    console.log('Getting word timestamps...');
    const wordTimestamps = await getWordTimestamps(storyAudioPath);

    await updateProgress(videoId, 40);

    // Launch Puppeteer
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps'
      ]
    });

    // Generate banner video
    console.log('Generating banner video...');
    const bannerVideoPath = await generateBannerVideo(
      browser,
      options,
      workingDir,
      openingDuration
    );
    tempFiles.push(bannerVideoPath);

    await updateProgress(videoId, 55);

    // Generate caption videos
    console.log('Generating caption videos...');
    const captionVideos = await generateCaptionVideos(
      browser,
      wordTimestamps,
      workingDir
    );
    tempFiles.push(...captionVideos);

    await updateProgress(videoId, 70);

    // Close browser
    await browser.close();
    browser = null;

    // Combine everything with FFmpeg
    console.log('Combining videos with FFmpeg...');
    const outputPath = path.join(tmpDir, `output_${videoId}.mp4`);
    await combineVideosWithFFmpeg(
      bannerVideoPath,
      captionVideos,
      openingAudioPath,
      storyAudioPath,
      options.background.category,
      outputPath,
      openingDuration,
      storyDuration
    );

    await updateProgress(videoId, 100);

    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        console.warn(`Failed to cleanup temp file: ${file}`);
      }
    }

    try {
      await fs.rmdir(workingDir);
    } catch (error) {
      console.warn(`Failed to cleanup working directory: ${workingDir}`);
    }

    return outputPath;

  } catch (error) {
    console.error('Error in Puppeteer video generation:', error);
    
    // Cleanup on error
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn('Failed to close browser:', e);
      }
    }

    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch (e) {
        console.warn(`Failed to cleanup temp file: ${file}`);
      }
    }

    throw error;
  }
}

async function generateBannerVideo(
  browser: puppeteer.Browser,
  options: VideoGenerationOptions,
  workingDir: string,
  duration: number
): Promise<string> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });

  // Load banner template
  const templatePath = path.join(process.cwd(), 'src', 'templates', 'reddit-banner.html');
  let template = await fs.readFile(templatePath, 'utf-8');

  // Replace template variables
  template = template
    .replace(/\{\{username\}\}/g, options.story.author || 'Anonymous')
    .replace(/\{\{subreddit\}\}/g, options.story.subreddit)
    .replace(/\{\{title\}\}/g, options.story.title)
    .replace(/\{\{upvotes\}\}/g, Math.floor(Math.random() * 500 + 100).toString())
    .replace(/\{\{comments\}\}/g, Math.floor(Math.random() * 100 + 20).toString())
    .replace(/\{\{duration\}\}/g, duration.toString());

  await page.setContent(template);
  await page.waitForTimeout(500); // Wait for animations to start

  // Record video
  const outputPath = path.join(workingDir, 'banner.webm');
  
  // Use page.evaluate to trigger recording
  await page.evaluate((dur) => {
    return new Promise((resolve) => {
      setTimeout(resolve, dur * 1000);
    });
  }, duration);

  // Take screenshots and convert to video (simplified approach)
  const screenshots: string[] = [];
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);

  for (let i = 0; i < totalFrames; i++) {
    const screenshotPath = path.join(workingDir, `banner_frame_${i.toString().padStart(4, '0')}.png`);
    await page.screenshot({ 
      path: screenshotPath,
      type: 'png',
      omitBackground: true
    });
    screenshots.push(screenshotPath);
  }

  await page.close();

  // Convert screenshots to video using FFmpeg
  await convertScreenshotsToVideo(screenshots, outputPath, fps);

  // Cleanup screenshots
  for (const screenshot of screenshots) {
    try {
      await fs.unlink(screenshot);
    } catch (error) {
      console.warn(`Failed to cleanup screenshot: ${screenshot}`);
    }
  }

  return outputPath;
}

async function generateCaptionVideos(
  browser: puppeteer.Browser,
  wordTimestamps: WordTimestamp[],
  workingDir: string
): Promise<string[]> {
  const captionVideos: string[] = [];

  for (let i = 0; i < wordTimestamps.length; i++) {
    const word = wordTimestamps[i];
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });

    // Load caption template
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'bouncing-captions.html');
    let template = await fs.readFile(templatePath, 'utf-8');

    const duration = word.end - word.start;
    template = template
      .replace(/\{\{text\}\}/g, word.text.toUpperCase())
      .replace(/\{\{duration\}\}/g, duration.toString());

    await page.setContent(template);
    await page.waitForTimeout(200); // Wait for animations to start

    // Generate video for this caption
    const outputPath = path.join(workingDir, `caption_${i}.webm`);
    
    // Take screenshots for animation
    const screenshots: string[] = [];
    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);

    for (let frame = 0; frame < totalFrames; frame++) {
      const screenshotPath = path.join(workingDir, `caption_${i}_frame_${frame.toString().padStart(4, '0')}.png`);
      await page.screenshot({ 
        path: screenshotPath,
        type: 'png',
        omitBackground: true
      });
      screenshots.push(screenshotPath);
      
      // Small delay between frames
      await page.waitForTimeout(1000 / fps);
    }

    await page.close();

    // Convert to video
    await convertScreenshotsToVideo(screenshots, outputPath, fps);
    captionVideos.push(outputPath);

    // Cleanup screenshots
    for (const screenshot of screenshots) {
      try {
        await fs.unlink(screenshot);
      } catch (error) {
        console.warn(`Failed to cleanup screenshot: ${screenshot}`);
      }
    }
  }

  return captionVideos;
}

async function convertScreenshotsToVideo(
  screenshots: string[],
  outputPath: string,
  fps: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', // Overwrite output
      '-framerate', fps.toString(),
      '-i', screenshots[0].replace(/\d{4}\.png$/, '%04d.png'),
      '-c:v', 'libvpx-vp9',
      '-pix_fmt', 'yuva420p', // Support transparency
      '-crf', '30',
      '-b:v', '2M',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

async function combineVideosWithFFmpeg(
  bannerVideo: string,
  captionVideos: string[],
  openingAudio: string,
  storyAudio: string,
  backgroundCategory: string,
  outputPath: string,
  openingDuration: number,
  storyDuration: number
): Promise<void> {
  // Get background video path
  const backgroundPath = path.join(process.cwd(), 'public', 'backgrounds', backgroundCategory, '1.mp4');

  return new Promise((resolve, reject) => {
    // Build FFmpeg command for complex composition
    const ffmpegArgs = [
      '-y', // Overwrite output
      '-i', backgroundPath, // Background video
      '-i', bannerVideo, // Banner overlay
      '-i', openingAudio, // Opening audio
      '-i', storyAudio, // Story audio
    ];

    // Add caption videos as inputs
    captionVideos.forEach(video => {
      ffmpegArgs.push('-i', video);
    });

    // Build filter complex for composition
    let filterComplex = `
      [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];
      [bg][1:v]overlay=0:0:enable='between(t,0,${openingDuration})'[with_banner];
    `;

    // Add caption overlays
    let currentInput = 'with_banner';
    captionVideos.forEach((_, index) => {
      const inputIndex = 4 + index; // Starting after background, banner, and audio inputs
      filterComplex += `[${currentInput}][${inputIndex}:v]overlay=0:0[with_caption_${index}];`;
      currentInput = `with_caption_${index}`;
    });

    // Audio mixing
    filterComplex += `[2:a][3:a]concat=n=2:v=0:a=1[audio]`;

    ffmpegArgs.push(
      '-filter_complex', filterComplex,
      '-map', `[${currentInput}]`,
      '-map', '[audio]',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'medium',
      '-crf', '23',
      '-r', '30',
      outputPath
    );

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg composition failed with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

async function getWordTimestamps(audioPath: string): Promise<WordTimestamp[]> {
  // This is a simplified version - you'd use Whisper or similar for real timestamps
  // For now, we'll create fake timestamps based on audio duration
  const duration = await getAudioDuration(audioPath);
  const words = ['FOUND', 'AN', 'OLD', 'LOCKED', 'CHEST', 'ITS', 'TICKING'];
  const wordDuration = duration / words.length;
  
  return words.map((word, index) => ({
    text: word,
    start: index * wordDuration,
    end: (index + 1) * wordDuration
  }));
} 