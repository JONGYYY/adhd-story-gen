import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { generateVideo } from '@/lib/video-generator';
import { VideoOptions, SubredditStory, VideoGenerationOptions } from '@/lib/video-generator/types';
import { generateStory } from '@/lib/story-generator/openai';
import { createVideoStatus, setVideoReady, setVideoFailed } from '@/lib/video-generator/status';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper function to get the appropriate tmp directory
function getTmpDir(): string {
  return process.env.VERCEL ? '/tmp' : os.tmpdir();
}

// Prevent static generation but use Node.js runtime for video generation
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const videoId = uuidv4();
  
  try {
    const options: VideoOptions = await request.json();
    console.log('Received video generation request with options:', JSON.stringify(options, null, 2));

    // Generate or use custom story
    let story: SubredditStory;
    if (options.customStory) {
      console.log('Using custom story:', JSON.stringify(options.customStory, null, 2));
      story = {
        title: options.customStory.title,
        story: options.customStory.story,
        subreddit: options.customStory.subreddit || 'r/stories',
        author: 'Anonymous',
      };
    } else {
      // Ensure subreddit has r/ prefix
      const subreddit = options.subreddit.startsWith('r/') ? options.subreddit : `r/${options.subreddit}`;
      console.log('Normalized subreddit:', subreddit);
      
      const storyParams = {
        subreddit,
        isCliffhanger: options.isCliffhanger,
        narratorGender: options.voice.gender,
      };
      console.log('Generating story with params:', JSON.stringify(storyParams, null, 2));
      story = await generateStory(storyParams);
    }

    // Log story data before validation
    console.log('Story data before validation:', JSON.stringify(story, null, 2));

    // Validate story data
    if (!story.title || !story.story) {
      console.error('Invalid story data:', JSON.stringify(story, null, 2));
      throw new Error('Story is missing required fields (title or story content)');
    }

    // Start video generation
    console.log('Starting video generation with story:', JSON.stringify(story, null, 2));
    
    const generationOptions: VideoGenerationOptions = {
      ...options,
      story,
    };

    // Check if running on Vercel for synchronous processing
    if (process.env.VERCEL) {
      console.log('Running on Vercel - using synchronous video generation');
      
      // Generate video synchronously
      const outputPath = await generateVideo(generationOptions, videoId);
      
      // Read the generated files and return them directly
      const tmpDir = getTmpDir();
      const videoFilename = `video_${videoId}.html`;
      const audioFilename = `audio_${videoId}.mp3`;
      
      const videoPath = path.join(tmpDir, videoFilename);
      const audioPath = path.join(tmpDir, audioFilename);
      
      try {
        const [videoContent, audioContent] = await Promise.all([
          fs.readFile(videoPath, 'utf-8'),
          fs.readFile(audioPath)
        ]);
        
        console.log('Successfully read generated files, returning synchronously');
        
        return NextResponse.json({
          success: true,
          videoId,
          synchronous: true,
          videoContent: videoContent,
          audioContent: audioContent.toString('base64'),
          videoContentType: 'text/html',
          audioContentType: 'audio/mpeg'
        });
      } catch (fileError) {
        console.error('Failed to read generated files:', fileError);
        throw new Error('Failed to read generated video files');
      }
    } else {
      console.log('Running locally - using asynchronous video generation');
      
      // Initialize video status for local development
      await createVideoStatus(videoId);
      
      // Generate video asynchronously
      const outputPath = await generateVideo(generationOptions, videoId);

      // Update status to ready
      await setVideoReady(videoId, outputPath);

      return NextResponse.json({
        success: true,
        videoId,
        synchronous: false,
        outputPath,
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate video';
    console.error('Error generating video:', error);
    
    // Only update status if not running synchronously on Vercel
    if (!process.env.VERCEL) {
      await setVideoFailed(videoId, errorMessage);
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 