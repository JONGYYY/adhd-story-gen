import { VideoGenerationOptions } from './types';
import { updateProgress, setVideoReady, setVideoFailed } from './status';
import { generateSpeech } from './voice';

// Helper function to convert ArrayBuffer to Buffer
function arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(arrayBuffer));
}

export async function generateVideo(
  options: VideoGenerationOptions,
  videoId: string
): Promise<string> {
  try {
    console.log('Starting Vercel video generation with external API...');
    
    // Skip status updates on Vercel since we're handling synchronously
    const story = options.story;

    // 1. Generate speech for the story
    console.log('Generating speech...');
    const openingAudio = await generateSpeech({
      text: story.startingQuestion || story.title,
      voice: options.voice,
    });

    const storyText = options.isCliffhanger && story.story.includes('[BREAK]')
      ? story.story.split('[BREAK]')[0].trim()
      : story.story;

    const storyAudio = await generateSpeech({
      text: storyText,
      voice: options.voice,
    });

    // 2. Combine audio files
    const openingBuffer = arrayBufferToBuffer(openingAudio);
    const storyBuffer = arrayBufferToBuffer(storyAudio);
    const combinedAudio = Buffer.concat([openingBuffer, storyBuffer]);

    // 3. Use Bannerbear API to create actual video
    console.log('Creating video with Bannerbear API...');
    const videoUrl = await createVideoWithBannerbear({
      audioBuffer: combinedAudio,
      title: story.title,
      backgroundCategory: options.background.category,
      story: story.story,
    });

    console.log('Video generation completed successfully:', videoUrl);
    return videoUrl;
  } catch (error) {
    console.error('Error in Vercel video generation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw error;
  }
}

async function createVideoWithBannerbear({
  audioBuffer,
  title,
  backgroundCategory,
  story,
}: {
  audioBuffer: Buffer;
  title: string;
  backgroundCategory: string;
  story: string;
}): Promise<string> {
  // This is a placeholder for a third-party video API
  // In a real implementation, you would:
  
  // 1. Upload the audio to a temporary storage (like AWS S3)
  // 2. Call Bannerbear/Creatomate/Similar API with:
  //    - Background video URL based on category
  //    - Audio URL
  //    - Text overlays (title, story)
  //    - Video dimensions (9:16 aspect ratio)
  // 3. Wait for video processing to complete
  // 4. Return the final video URL
  
  console.log('Would create video with:', {
    title,
    backgroundCategory,
    storyLength: story.length,
    audioSize: audioBuffer.length
  });
  
  // For now, return a placeholder
  throw new Error('Video API integration not implemented yet. This requires a paid service like Bannerbear, Creatomate, or similar.');
} 