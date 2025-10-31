1import { VideoOptions, SubredditStory, VideoSegment, VideoMetadata, VideoGenerationOptions } from './types';
import { generateStory } from '../story-generator/openai';
import { selectBackgroundClips, processBackgroundClip } from './background';
import { generateSpeech, getAudioDuration } from './voice';
import { generateTimedSegments, generateAssFile, generateBannerOverlay } from './subtitles';
import { updateProgress } from './status';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { generateVideoWithRemotion } from './remotion-entry';

const execAsync = promisify(exec);

// Helper function to convert ArrayBuffer to Buffer
function arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(arrayBuffer));
}

// Helper function to split text into caption segments
function splitIntoSegments(text: string): string[] {
  // Split by punctuation and spaces
  return text
    .split(/([,.!?]|\s+)/)
    .filter(segment => segment.trim().length > 0)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

// export { generateVideo as generateMoviePyVideo } from './moviepy-generator'; // disabled: force Remotion
// export { generateVideo as generateHybridVideo } from './hybrid-generator'; // disabled: force Remotion

export async function generateVideo(options: VideoOptions, videoId: string): Promise<string> {
  // Generate or use custom story
  let story: SubredditStory;
  if (options.customStory) {
    story = {
      title: options.customStory.title,
      story: options.customStory.story,
      subreddit: options.customStory.subreddit || options.subreddit,
      author: 'Anonymous', // Add the required author field
    };
  } else {
    story = await generateStory({
      subreddit: options.subreddit,
      isCliffhanger: options.isCliffhanger,
      narratorGender: options.voice.gender,
    });
  }

  const generationOptions: VideoGenerationOptions = {
    ...options,
    story,
  };

  // Force Remotion pipeline only (no MoviePy / hybrid fallback)
  console.log(`[gen ${videoId}] Forcing Remotion pipeline`);
  return await generateVideoWithRemotion(generationOptions as any, videoId);
} 