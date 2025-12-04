'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-container';
import { VideoOptions, VoiceOption, VideoBackground } from '@/lib/video-generator/types';
import { Progress } from '@/components/ui/progress';

type Voice = {
  id: VoiceOption['id'];
  name: string;
  preview: string;
  description: string;
  previewText: string;
  gender: VoiceOption['gender'];
};

export default function Create() {
  const [storySource, setStorySource] = useState<'ai' | 'reddit' | 'paste' | null>(null);
  const [selectedSubreddit, setSelectedSubreddit] = useState<string | null>(null);
  const [storyText, setStoryText] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [storyLength, setStoryLength] = useState<'1 min+ (Cliffhanger)' | 'Full Story Length'>('1 min+ (Cliffhanger)');
  const [captionStyle, setCaptionStyle] = useState('modern');
  const [showRedditUI, setShowRedditUI] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [storyIdeas, setStoryIdeas] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  // Add loading state
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const subredditCategories = {
    'Testing & Development': [
      { name: 'r/test', description: 'Test option - Generates very short stories', icon: '🧪' },
    ],
    'Drama & Relationships': [
      { name: 'r/AITA', description: 'Am I The Asshole - Moral dilemmas and conflicts', icon: '⚖️' },
      { name: 'r/relationships', description: 'Relationship advice and stories', icon: '❤️' },
      { name: 'r/TrueOffMyChest', description: 'Personal confessions and experiences', icon: '💭' },
    ],
    'Horror & Supernatural': [
      { name: 'r/nosleep', description: 'Horror stories and supernatural experiences', icon: '👻' },
      { name: 'r/ShortScaryStories', description: 'Brief horror tales', icon: '🔪' },
    ],
    'Life Stories': [
      { name: 'r/confession', description: 'Anonymous confessions', icon: '🤫' },
      { name: 'r/TIFU', description: 'Today I Fucked Up - Personal mistakes', icon: '😅' },
      { name: 'r/ProRevenge', description: 'Professional revenge stories', icon: '😈' },
    ],
    'Work Tales': [
      { name: 'r/TalesFromYourServer', description: 'Restaurant service stories', icon: '🍽️' },
      { name: 'r/TalesFromTechSupport', description: 'IT and tech support stories', icon: '💻' },
    ],
  };

  const backgrounds: Array<{
    id: string;
    name: string;
    thumbnail: string;
    category: string;
    description?: string;
  }> = [
    {
      id: 'minecraft',
      name: 'Minecraft Parkour',
      thumbnail: '/backgrounds/minecraft.jpg',
      category: 'Gaming',
    },
    {
      id: 'subway',
      name: 'Subway Surfers',
      thumbnail: '/backgrounds/subway.jpg',
      category: 'Gaming',
    },
    {
      id: 'cooking',
      name: 'Cooking',
      thumbnail: '/backgrounds/cooking.jpg',
      category: 'Lifestyle',
    },
    {
      id: 'workers',
      name: 'Workers',
      thumbnail: '/backgrounds/workers.jpg',
      category: 'Lifestyle',
    }
  ];

  const voices: Voice[] = [
    {
      id: 'brian',
      name: 'Brian',
      preview: '/api/preview-voice?voiceId=brian',
      description: 'Deep, authoritative male voice with a professional tone',
      previewText: 'Perfect for serious stories and dramatic revelations',
      gender: 'male',
    },
    {
      id: 'adam',
      name: 'Adam',
      preview: '/api/preview-voice?voiceId=adam',
      description: 'Friendly, casual male voice with natural inflection',
      previewText: 'Great for relatable, everyday stories',
      gender: 'male',
    },
    {
      id: 'antoni',
      name: 'Antoni',
      preview: '/api/preview-voice?voiceId=antoni',
      description: 'Energetic, expressive male voice with character',
      previewText: 'Perfect for humorous and engaging tales',
      gender: 'male',
    },
    {
      id: 'sarah',
      name: 'Sarah',
      preview: '/api/preview-voice?voiceId=sarah',
      description: 'Professional, articulate female voice',
      previewText: 'Ideal for clear, compelling narratives',
      gender: 'female',
    },
    {
      id: 'laura',
      name: 'Laura',
      preview: '/api/preview-voice?voiceId=laura',
      description: 'Warm, empathetic female voice',
      previewText: 'Great for emotional and personal stories',
      gender: 'female',
    },
    {
      id: 'rachel',
      name: 'Rachel',
      preview: '/api/preview-voice?voiceId=rachel',
      description: 'Dynamic, engaging female voice',
      previewText: 'Perfect for dramatic and intense stories',
      gender: 'female',
    },
  ];

  // Function to handle voice preview
  const handlePreviewVoice = async (voiceId: string) => {
    try {
      // Stop any currently playing preview
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // If clicking the same voice that's playing, just stop it
      if (previewingVoice === voiceId) {
        setPreviewingVoice(null);
        return;
      }

      setIsLoadingPreview(voiceId);

      // Create new audio element
      const audio = new Audio();
      audioRef.current = audio;

      // Set up event listeners
      audio.addEventListener('ended', () => {
        setPreviewingVoice(null);
        setIsLoadingPreview(null);
      });

      audio.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        setPreviewingVoice(null);
        setIsLoadingPreview(null);
      });

      // Load and play the audio
      const response = await fetch(`/api/preview-voice?voiceId=${voiceId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load preview: ${errorText}`);
      }

      const blob = await response.blob();
      audio.src = URL.createObjectURL(blob);

      // Play the preview
      await audio.play();
      setPreviewingVoice(voiceId);
      setIsLoadingPreview(null);
    } catch (error) {
      console.error('Failed to play voice preview:', error);
      setPreviewingVoice(null);
      setIsLoadingPreview(null);
    }
  };

  const handleGenerateVideo = async () => {
    try {
      setError(null);
      setIsGenerating(true);
      setProgress(0);

      if (!selectedBackground || !selectedVoice) {
        setError('Please select a background and voice before generating.');
        return;
      }

      const selectedVoiceData = voices.find(v => v.id === selectedVoice);
      if (!selectedVoiceData) {
        setError('Selected voice not found.');
        return;
      }

      // Prepare story data based on source
      let storyData: {
        title: string;
        story: string;
        subreddit?: string;
      } | undefined;

      if (storySource === 'paste') {
        if (!storyTitle.trim() || !storyText.trim()) {
          setError('Please enter both a title and story content.');
          return;
        }
        storyData = {
          title: storyTitle,
          story: storyText,
          subreddit: 'r/stories', // Default subreddit for custom stories
        };
      } else if (!selectedSubreddit) {
        setError('Please select a subreddit before generating.');
        return;
      }

      const options: VideoOptions = {
        subreddit: selectedSubreddit?.startsWith('r/') ? selectedSubreddit : `r/${selectedSubreddit}` || 'r/stories',
        isCliffhanger: storyLength === '1 min+ (Cliffhanger)',
        background: {
          category: selectedBackground as VideoBackground['category'],
          speedMultiplier: 1.0,
        },
        voice: {
          id: selectedVoice,
          gender: selectedVoiceData.gender,
        },
        captionStyle: {
          font: 'Arial-Bold',
          size: 72,
          color: 'white',
          outlineColor: 'black',
          outlineWidth: 4,
          shadowColor: 'black',
          shadowOffset: 2,
          position: 'center',
        },
        uiOverlay: {
          showSubreddit: true,
          showRedditUI: showRedditUI,
          showBanner: true,
        },
        customStory: storyData,
      };

      console.log('Sending video generation request...');
      let response;
      try {
        // Use worker base URL if provided; fall back to same-origin
        const API_BASE = process.env.NEXT_PUBLIC_RAILWAY_API_URL || '';
        response = await fetch(`${API_BASE}/api/generate-video`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(options),
        });
      } catch (fetchError) {
        console.error('Network error during video generation request:', fetchError);
        setError(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect to server'}. Please check your internet connection and try again.`);
        setIsGenerating(false);
        setProgress(0);
        return;
      }

      console.log('Response received:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage;
        try {
          const errorText = await response.text();
          console.error('Video generation failed:', response.status, errorText);
          errorMessage = `Video generation failed (${response.status}): ${errorText}`;
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorMessage = `Video generation failed (${response.status}): ${response.statusText}`;
        }
        setError(errorMessage);
        setIsGenerating(false);
        setProgress(0);
        return;
      }

      let data;
      try {
        data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        setError('Invalid response from server. Please try again.');
        setIsGenerating(false);
        setProgress(0);
        return;
      }
      
      if (!data.success) {
        console.error('Server returned unsuccessful response:', data);
        setError(data.error || 'Video generation failed. Please try again.');
        setIsGenerating(false);
        setProgress(0);
        return;
      }
      
      if (!data.videoId) {
        console.error('Invalid server response - missing videoId:', data);
        setError('Invalid response from server: missing video ID. Please try again.');
        setIsGenerating(false);
        setProgress(0);
        return;
      }

      console.log('Starting to poll for video status with ID:', data.videoId);

      // Start polling for video status
      let pollCount = 0;
      const maxPolls = 300; // 10 minutes timeout (300 * 2 seconds)
      
      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          
          // Timeout after 10 minutes
          if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            console.error('Video generation timed out after', maxPolls * 2, 'seconds');
            setError('Video generation timed out. This might be due to high server load. Please try again.');
            setIsGenerating(false);
            setProgress(0);
            return;
          }

          console.log(`Polling video status (attempt ${pollCount}/${maxPolls})`);
          
          let statusResponse;
          try {
            const API_BASE = process.env.NEXT_PUBLIC_RAILWAY_API_URL || '';
            statusResponse = await fetch(`${API_BASE}/api/video-status/${data.videoId}`, {
              method: 'GET',
              cache: 'no-cache',
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            });
          } catch (fetchError) {
            console.error('Fetch error:', fetchError);
            throw new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'}`);
          }
          
          if (!statusResponse.ok) {
            console.error('Status response not ok:', statusResponse.status, statusResponse.statusText);
            throw new Error(`Failed to get video status: ${statusResponse.status} ${statusResponse.statusText}`);
          }

          const statusData = await statusResponse.json();
          console.log('Status data received:', JSON.stringify(statusData, null, 2));
          
          // Always update progress if we have it
          if (typeof statusData.progress === 'number') {
            console.log('Updating progress from', progress, 'to', statusData.progress);
            setProgress(statusData.progress);
          }
          
          // Handle different status cases
          if (statusData.status === 'ready') {
            console.log('✅ Video is ready!');
            console.log('Video URL:', statusData.videoUrl);
            console.log('Clearing interval and redirecting...');
            clearInterval(pollInterval);
            
            // Add a small delay to ensure UI updates
            setTimeout(() => {
              // Redirect directly to the MP4 served by the worker
              const API_BASE = process.env.NEXT_PUBLIC_RAILWAY_API_URL || '';
              const target = statusData.videoUrl || `${API_BASE}/videos/${data.videoId}.mp4`;
              console.log('Redirecting to:', target);
              window.location.href = target;
            }, 500);
            
          } else if (statusData.status === 'failed') {
            console.error('❌ Video generation failed:', statusData.error);
            clearInterval(pollInterval);
            setError(`Video generation failed: ${statusData.error || 'Unknown error'}`);
            setIsGenerating(false);
            setProgress(0);
            
          } else if (statusData.status === 'not_found') {
            console.warn('⚠️ Video status not found');
            // If status is not found after some time, it might indicate an issue
            if (pollCount > 15) { // After 30 seconds
              console.error('Video status lost after 30 seconds');
              clearInterval(pollInterval);
              setError('Video generation status lost. This might be a server issue. Please try again.');
              setIsGenerating(false);
              setProgress(0);
            }
            
          } else if (statusData.status === 'generating') {
            console.log('🔄 Video still generating, progress:', statusData.progress);
            // Continue polling
            
          } else {
            console.warn('Unknown status:', statusData.status);
          }
          
        } catch (error) {
          console.error('❌ Failed to poll video status:', error);
          console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            pollCount,
            videoId: data.videoId
          });
          
          // Don't fail immediately on network errors, try a few more times
          if (pollCount < 5) {
            console.log('Retrying due to early error...');
            return;
          }
          
          clearInterval(pollInterval);
          setError(`Failed to check video status: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
          setIsGenerating(false);
          setProgress(0);
        }
      }, 1000); // Poll every 1 second (faster polling)

    } catch (error) {
      console.error('Failed to generate video:', error);
      setError('Failed to generate video. Please try again.');
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return (
    <PageContainer>
      <div className="bg-gray-800 border-b border-gray-700 w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-white">Create Viral Reddit Story Video</h1>
          <p className="mt-2 text-gray-400">Generate engaging story videos in minutes</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-8">
            {/* Story Source Selection */}
            <div>
              <h2 className="text-xl font-semibold mb-6">Choose Your Story Source</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <button
                  onClick={() => setStorySource('ai')}
                  className={`relative p-6 rounded-xl border-2 transition-all ${
                    storySource === 'ai'
                      ? 'border-primary bg-primary/5 shadow-lg'
                      : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="text-4xl mb-4">🤖</div>
                  <h3 className="text-lg font-semibold mb-2">AI Generation</h3>
                  <p className="text-gray-400 text-sm">
                    Create unique, viral-worthy stories using advanced AI
                  </p>
                  {storySource === 'ai' && (
                    <div className="absolute top-2 right-2 text-primary">
                      <span className="text-xl">✓</span>
          </div>
                  )}
                </button>

            <button
                  onClick={() => setStorySource('reddit')}
                  className={`relative p-6 rounded-xl border-2 transition-all ${
                    storySource === 'reddit'
                      ? 'border-primary bg-primary/5 shadow-lg'
                      : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="text-4xl mb-4">📱</div>
                  <h3 className="text-lg font-semibold mb-2">Reddit Stories</h3>
                  <p className="text-gray-400 text-sm">
                    Source trending stories from popular subreddits
                  </p>
                  {storySource === 'reddit' && (
                    <div className="absolute top-2 right-2 text-primary">
                      <span className="text-xl">✓</span>
                    </div>
                  )}
                </button>

                <button
                  onClick={() => setStorySource('paste')}
                  className={`relative p-6 rounded-xl border-2 transition-all ${
                    storySource === 'paste'
                      ? 'border-primary bg-primary/5 shadow-lg'
                      : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="text-4xl mb-4">📝</div>
                  <h3 className="text-lg font-semibold mb-2">Custom Story</h3>
                  <p className="text-gray-400 text-sm">
                    Write or paste your own story text
                  </p>
                  {storySource === 'paste' && (
                    <div className="absolute top-2 right-2 text-primary">
                      <span className="text-xl">✓</span>
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Story Content */}
            {(storySource === 'reddit' || storySource === 'ai') && (
              <div>
                <h2 className="text-xl font-semibold mb-6">Select Subreddit Style</h2>
                <div className="space-y-6">
                  {Object.entries(subredditCategories).map(([category, subreddits]) => (
                    <div key={category}>
                      <h3 className="text-lg font-medium text-gray-300 mb-3">{category}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {subreddits.map((sub) => (
                          <button
                            key={sub.name}
                            onClick={() => setSelectedSubreddit(sub.name)}
                            className={`p-4 rounded-xl border transition-all ${
                              selectedSubreddit === sub.name
                                ? 'border-primary bg-primary/5 shadow-lg'
                                : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{sub.icon}</span>
                              <div className="text-left">
                                <h4 className="font-medium">{sub.name}</h4>
                                <p className="text-sm text-gray-400">{sub.description}</p>
                              </div>
                              {selectedSubreddit === sub.name && (
                                <div className="ml-auto text-primary">
                                  <span className="text-xl">✓</span>
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {storySource === 'paste' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-6">Write Your Story</h2>
                
                {/* Title Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">Story Title</label>
                  <input
                    type="text"
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    placeholder="Enter an engaging title..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Story Text Input */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium">Story Content</label>
                    <span className="text-sm text-gray-400">
                      {storyText.split(/\s+/).length} words
                    </span>
                  </div>
                  <textarea
                    value={storyText}
                    onChange={(e) => setStoryText(e.target.value)}
                    className="w-full h-64 bg-gray-800 border border-gray-700 rounded-lg p-4 focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Write or paste your story here..."
                  />
                </div>

                {/* Writing Tips */}
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-medium mb-3">Writing Tips</h3>
                  <ul className="space-y-2 text-gray-400">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      Start with a hook that grabs attention
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      Use descriptive language and dialogue
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      Build tension throughout the story
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      End with a satisfying conclusion
                    </li>
                  </ul>
                </div>

                {/* AI Story Ideas */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Need Inspiration?</h3>
                    <Button
                      onClick={async () => {
                        setIsGeneratingIdeas(true);
                        try {
                          const response = await fetch('/api/generate-ideas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ count: 3 })
                          });
                          
                          if (!response.ok) throw new Error('Failed to generate ideas');
                          
                          const data = await response.json();
                          setStoryIdeas(data.ideas);
                        } catch (error) {
                          console.error('Failed to generate ideas:', error);
                          setError('Failed to generate story ideas. Please try again.');
                        } finally {
                          setIsGeneratingIdeas(false);
                        }
                      }}
                      disabled={isGeneratingIdeas}
                      className="text-sm"
                    >
                      {isGeneratingIdeas ? 'Generating...' : 'Generate Ideas'}
                    </Button>
                  </div>
                  
                  {storyIdeas.length > 0 && (
                    <div className="grid gap-3">
                      {storyIdeas.map((idea, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setStoryTitle(idea.split(':')[0]);
                            setStoryText(idea.split(':')[1].trim());
                          }}
                          className="text-left p-3 rounded-lg border border-gray-700 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
                        >
                          <p className="text-sm text-gray-300">{idea}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Background Selection */}
            <div>
              <h2 className="text-lg font-medium mb-4">Select Background</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {backgrounds.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setSelectedBackground(bg.id)}
                    className={`relative rounded-lg overflow-hidden aspect-video ${
                      selectedBackground === bg.id
                        ? 'ring-2 ring-primary'
                        : 'hover:ring-2 hover:ring-gray-500'
                    }`}
                  >
                    <img
                      src={bg.thumbnail}
                      alt={bg.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-2">
                      <span className="text-sm font-medium">{bg.name}</span>
                      <span className="text-xs text-gray-400">{bg.category}</span>
                      {bg.description && (
                        <span className="text-xs text-gray-400 mt-1">{bg.description}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Voices */}
                  <div>
              <h2 className="text-lg font-medium mb-4">Select Voice</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {voices.map((voice) => (
                  <div
                    key={voice.id}
                    className={`p-4 rounded-lg border transition-all ${
                      selectedVoice === voice.id
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-white">{voice.name}</h3>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewVoice(voice.id);
                        }}
                        disabled={isLoadingPreview !== null}
                        className={`text-primary hover:text-primary/80 flex items-center gap-2 ${
                          isLoadingPreview !== null && 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {isLoadingPreview === voice.id ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin">⏳</span> Loading...
                          </span>
                        ) : previewingVoice === voice.id ? (
                          <span className="flex items-center gap-2">⏹️ Stop</span>
                        ) : (
                          <span className="flex items-center gap-2">▶️ Preview</span>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">{voice.description}</p>
                    <p className="text-xs text-gray-500 italic mb-3">&quot;{voice.previewText}&quot;</p>
                    <button
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`mt-2 w-full py-1 px-3 rounded text-sm font-medium transition-colors text-center ${
                        selectedVoice === voice.id
                          ? 'bg-primary/20 text-primary'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {selectedVoice === voice.id ? 'Selected' : 'Select Voice'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Options */}
            <div className="space-y-4">
                  <div>
                <label className="block text-sm font-medium mb-2">
                  Video Length
                    </label>
                <select
                  value={storyLength}
                  onChange={(e) => setStoryLength(e.target.value as '1 min+ (Cliffhanger)' | 'Full Story Length')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                >
                  <option>1 min+ (Cliffhanger)</option>
                  <option>Full Story Length</option>
                    </select>
                  </div>
                  <div>
                <label className="block text-sm font-medium mb-2">
                  Reddit UI Elements
                    </label>
                <div className="flex items-center space-x-2">
                    <input
                    type="checkbox"
                    checked={showRedditUI}
                    onChange={(e) => setShowRedditUI(e.target.checked)}
                    className="rounded border-gray-700 bg-gray-800"
                  />
                  <span className="text-sm text-gray-400">
                    Show upvotes and other Reddit UI elements
                  </span>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button 
              className="w-full py-6 text-lg relative" 
              onClick={handleGenerateVideo}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </span>
                  <span className="opacity-0">Generate Video</span>
                </>
              ) : (
                'Generate Video'
              )}
            </Button>

            {/* Show error if any - moved below button */}
            {error && (
              <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {/* Generation Progress */}
            {isGenerating && (
              <div className="space-y-4">
                <Progress value={progress} className="w-full h-2" />
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium text-gray-200">{progress}% Complete</p>
                  <p className="text-sm text-gray-400">
                    {progress < 25 && 'Generating story...'}
                    {progress >= 25 && progress < 50 && 'Converting text to speech...'}
                    {progress >= 50 && progress < 75 && 'Processing background video...'}
                    {progress >= 75 && progress < 100 && 'Compositing final video...'}
                    {progress === 100 && 'Finishing up...'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
} 