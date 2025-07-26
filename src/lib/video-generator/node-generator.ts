import { VideoOptions, SubredditStory, VideoSegment, VideoGenerationOptions } from './types';
import { generateSpeech, getAudioDuration } from './voice';
import { updateProgress, setVideoReady, setVideoFailed } from './status';
import { generateBanner } from '../banner-generator';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Helper function to convert ArrayBuffer to Buffer
function arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(arrayBuffer));
}

// Helper function to get the appropriate tmp directory
function getTmpDir(): string {
  // Use /tmp for Vercel, os.tmpdir() for local development
  return process.env.VERCEL ? '/tmp' : os.tmpdir();
}

// Helper function to estimate audio duration from file size
function estimateAudioDuration(audioBuffer: Buffer): number {
  // Very rough estimate: assume 128kbps MP3
  // 1 second of 128kbps audio = ~16KB
  const bytesPerSecond = 16000;
  return audioBuffer.length / bytesPerSecond;
}

// Helper function to create a simple video HTML file
function createVideoHTML(audioUrl: string, title: string, backgroundImage: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: white;
        }
        .video-container {
            width: 360px;
            height: 640px;
            background: #000;
            border-radius: 20px;
            overflow: hidden;
            position: relative;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .background {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4);
            background-size: 400% 400%;
            animation: gradient 15s ease infinite;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .content {
            position: relative;
            z-index: 2;
            padding: 40px 20px;
            text-align: center;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 30px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            line-height: 1.2;
        }
        .audio-player {
            width: 100%;
            margin: 20px 0;
            background: rgba(255,255,255,0.1);
            border-radius: 25px;
            padding: 10px;
            backdrop-filter: blur(10px);
        }
        .audio-player audio {
            width: 100%;
            height: 50px;
        }
        .play-message {
            font-size: 18px;
            margin-top: 20px;
            opacity: 0.9;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        .download-link {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255,255,255,0.2);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        .download-link:hover {
            background: rgba(255,255,255,0.3);
            transform: translateX(-50%) translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="video-container">
        <div class="background"></div>
        <div class="content">
            <div class="title">${title}</div>
            <div class="audio-player">
                <audio controls>
                    <source src="${audioUrl}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
            <div class="play-message">🎧 Your story is ready to listen!</div>
        </div>
        <a href="${audioUrl}" download class="download-link">Download Audio</a>
    </div>
</body>
</html>
  `;
}

export async function generateVideo(
  options: VideoGenerationOptions,
  videoId: string
): Promise<string> {
  try {
    // Create necessary directories
    const tmpDir = getTmpDir();
    
    console.log('Creating directories:', {
      tmpDir
    });
    
    await fs.mkdir(tmpDir, { recursive: true });

    // 1. Story is already provided (10%)
    if (!process.env.VERCEL) await updateProgress(videoId, 0);
    const story = options.story;
    if (!process.env.VERCEL) await updateProgress(videoId, 10);

    // 2. Generate speech for opening and story (50%)
    const openingAudio = await generateSpeech({
      text: story.startingQuestion || story.title,
      voice: options.voice,
    });
    if (!process.env.VERCEL) await updateProgress(videoId, 30);

    const storyText = options.isCliffhanger && story.story.includes('[BREAK]')
      ? story.story.split('[BREAK]')[0].trim()
      : story.story;

    const storyAudio = await generateSpeech({
      text: storyText,
      voice: options.voice,
    });
    if (!process.env.VERCEL) await updateProgress(videoId, 50);

    // 3. Combine audio files (70%)
    const openingBuffer = arrayBufferToBuffer(openingAudio);
    const storyBuffer = arrayBufferToBuffer(storyAudio);
    
    // Simple concatenation by combining buffers
    const combinedAudio = Buffer.concat([openingBuffer, storyBuffer]);
    
    // Save combined audio
    const audioFilename = `audio_${videoId}.mp3`;
    const audioPath = path.join(tmpDir, audioFilename);
    await fs.writeFile(audioPath, combinedAudio);
    if (!process.env.VERCEL) await updateProgress(videoId, 70);

    // 4. Create HTML video player (90%)
    const htmlFilename = `video_${videoId}.html`;
    const htmlPath = path.join(tmpDir, htmlFilename);
    const audioUrl = `/api/videos/${audioFilename}`;
    
    const htmlContent = createVideoHTML(audioUrl, story.title, options.background.category);
    await fs.writeFile(htmlPath, htmlContent);
    if (!process.env.VERCEL) await updateProgress(videoId, 90);

    // 5. Set video URL (100%)
    const videoUrl = `/api/videos/${htmlFilename}`;
    if (!process.env.VERCEL) {
      await setVideoReady(videoId, videoUrl);
      await updateProgress(videoId, 100);
    }

    console.log('Video generation completed successfully:', videoUrl);
    return videoUrl;
  } catch (error) {
    console.error('Error in generateVideo:', error);
    // Set video status to failed with error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    if (!process.env.VERCEL) await setVideoFailed(videoId, errorMessage);
    throw error;
  }
} 