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

// Helper function to create a video-like HTML file with background video
function createVideoHTML(audioUrl: string, title: string, backgroundCategory: string): string {
  // Map background categories to video files
  const backgroundVideos: Record<string, string> = {
    'minecraft': '/backgrounds/minecraft/1.mp4',
    'subway': '/backgrounds/subway/1.mp4', 
    'cooking': '/backgrounds/cooking/1.mp4',
    'workers': '/backgrounds/workers/1.mp4',
    'Gaming': '/backgrounds/minecraft/1.mp4',
    'Lifestyle': '/backgrounds/cooking/1.mp4'
  };

  const backgroundVideo = backgroundVideos[backgroundCategory] || '/backgrounds/minecraft/1.mp4';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .video-container {
            width: 360px;
            height: 640px;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        
        .background-video {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.8;
        }
        
        .overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(180deg, 
                rgba(0,0,0,0.3) 0%, 
                rgba(0,0,0,0.1) 30%, 
                rgba(0,0,0,0.1) 70%, 
                rgba(0,0,0,0.4) 100%);
            z-index: 1;
        }
        
        .content {
            position: relative;
            z-index: 2;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 20px;
            color: white;
        }
        
        .reddit-header {
            background: rgba(255, 255, 255, 0.95);
            color: #1a1a1b;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .story-title {
            font-size: 22px;
            font-weight: bold;
            line-height: 1.3;
            text-align: center;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            margin-bottom: 20px;
            padding: 0 10px;
        }
        
        .controls-section {
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
        }
        
        .audio-controls {
            margin-bottom: 16px;
        }
        
        .audio-controls audio {
            width: 100%;
            height: 48px;
            border-radius: 24px;
        }
        
        .play-button {
            background: #ff4458;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin: 10px 0;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        
        .play-button:hover {
            background: #e63946;
            transform: translateY(-1px);
        }
        
        .status-text {
            font-size: 14px;
            opacity: 0.9;
            margin-top: 8px;
        }
        
        .reddit-ui {
            position: absolute;
            bottom: 80px;
            left: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            color: #1a1a1b;
            padding: 12px 16px;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            font-weight: 500;
        }
        
        .upvotes {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #ff4458;
        }
        
        .comments {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #878a8c;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        
        .playing .background-video {
            animation: pulse 2s ease-in-out infinite;
        }
        
        .waveform {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
            height: 20px;
            margin: 10px 0;
        }
        
        .wave-bar {
            width: 3px;
            background: #ff4458;
            border-radius: 2px;
            opacity: 0.3;
            transition: all 0.1s ease;
        }
        
        .playing .wave-bar {
            animation: wave 1s ease-in-out infinite;
        }
        
        @keyframes wave {
            0%, 100% { height: 4px; opacity: 0.3; }
            50% { height: 16px; opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="video-container" id="videoContainer">
        <video class="background-video" autoplay muted loop playsinline>
            <source src="${backgroundVideo}" type="video/mp4">
        </video>
        
        <div class="overlay"></div>
        
        <div class="content">
            <div class="reddit-header">
                📱 r/stories • Posted by u/Anonymous
            </div>
            
            <div class="story-title">${title}</div>
            
            <div class="controls-section">
                <div class="audio-controls">
                    <audio id="storyAudio" preload="auto">
                        <source src="${audioUrl}" type="audio/mpeg">
                    </audio>
                </div>
                
                <button class="play-button" id="playButton">
                    <span id="playIcon">▶️</span>
                    <span id="playText">Play Story</span>
                </button>
                
                <div class="waveform" id="waveform">
                    ${Array.from({length: 20}, (_, i) => `<div class="wave-bar" style="animation-delay: ${i * 0.1}s; height: ${Math.random() * 12 + 4}px;"></div>`).join('')}
                </div>
                
                <div class="status-text" id="statusText">
                    🎧 Tap play to start the story
                </div>
            </div>
        </div>
        
        <div class="reddit-ui">
            <div class="upvotes">⬆️ ${Math.floor(Math.random() * 500) + 100}</div>
            <div class="comments">💬 ${Math.floor(Math.random() * 50) + 10}</div>
            <div>🎁 ${Math.floor(Math.random() * 5) + 1}</div>
        </div>
    </div>

    <script>
        const audio = document.getElementById('storyAudio');
        const playButton = document.getElementById('playButton');
        const playIcon = document.getElementById('playIcon');
        const playText = document.getElementById('playText');
        const statusText = document.getElementById('statusText');
        const container = document.getElementById('videoContainer');
        const waveform = document.getElementById('waveform');
        
        let isPlaying = false;
        
        playButton.addEventListener('click', function() {
            if (!isPlaying) {
                audio.play();
                isPlaying = true;
                playIcon.textContent = '⏸️';
                playText.textContent = 'Pause';
                statusText.textContent = '🔊 Story is playing...';
                container.classList.add('playing');
            } else {
                audio.pause();
                isPlaying = false;
                playIcon.textContent = '▶️';
                playText.textContent = 'Play Story';
                statusText.textContent = '⏸️ Story paused';
                container.classList.remove('playing');
            }
        });
        
        audio.addEventListener('ended', function() {
            isPlaying = false;
            playIcon.textContent = '▶️';
            playText.textContent = 'Play Again';
            statusText.textContent = '✅ Story completed!';
            container.classList.remove('playing');
        });
        
        audio.addEventListener('timeupdate', function() {
            if (isPlaying) {
                const progress = (audio.currentTime / audio.duration) * 100;
                statusText.textContent = \`🔊 Playing... \${Math.floor(progress)}%\`;
            }
        });
        
        // Auto-start the background video
        const backgroundVideo = document.querySelector('.background-video');
        backgroundVideo.addEventListener('loadeddata', function() {
            // Start at a random point in the video
            const randomStart = Math.random() * (backgroundVideo.duration - 30);
            backgroundVideo.currentTime = randomStart;
        });
    </script>
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