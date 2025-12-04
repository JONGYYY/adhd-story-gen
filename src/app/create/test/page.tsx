'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-container';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setVideoUrl(null);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_RAILWAY_API_URL || '';
      const response = await fetch(`${API_BASE}/api/generate-test-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          background: 'minecraft'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Poll for progress
        const videoId = data.videoId;
        const pollProgress = async () => {
          try {
            const API_BASE = process.env.NEXT_PUBLIC_RAILWAY_API_URL || '';
            const statusResponse = await fetch(`${API_BASE}/api/video-status/${videoId}`);
            const statusData = await statusResponse.json();
            
            setProgress(statusData.progress || 0);
            
            if (statusData.status === 'completed' || statusData.status === 'ready') {
              setVideoUrl(statusData.videoUrl);
              setIsGenerating(false);
              setProgress(100);
            } else if (statusData.status === 'failed') {
              throw new Error(statusData.error || 'Video generation failed');
            } else {
              setTimeout(pollProgress, 2000);
            }
          } catch (error) {
            console.error('Error polling progress:', error);
            setError('Failed to check video status');
            setIsGenerating(false);
          }
        };
        
        setTimeout(pollProgress, 1000);
      } else {
        throw new Error(data.error || 'Failed to start video generation');
      }
    } catch (error) {
      console.error('Error generating video:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate video');
      setIsGenerating(false);
    }
  };

  return (
    <PageContainer>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Test Video Generator</CardTitle>
            <CardDescription>Generate a test video with Minecraft background and banner images</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? 'Generating...' : 'Generate Video'}
            </Button>

            {isGenerating && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-500 rounded text-red-400 text-sm">
                {error}
              </div>
            )}

            {videoUrl && (
              <div className="space-y-3">
                <div className="p-3 bg-green-900/20 border border-green-500 rounded text-green-400 text-sm">
                  ✅ Video generated successfully!
                </div>
                <Button asChild className="w-full">
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                    View Video
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
} 