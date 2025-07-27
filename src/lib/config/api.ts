// API Configuration for switching between local and Railway
export const API_CONFIG = {
  // Railway API URL (you'll need to replace this with your actual Railway URL)
  RAILWAY_API_URL: process.env.NEXT_PUBLIC_RAILWAY_API_URL || 'https://your-railway-app.railway.app',
  
  // Use Railway API in production, local API in development
  getVideoGenerationUrl: () => {
    if (process.env.NODE_ENV === 'production') {
      return `${API_CONFIG.RAILWAY_API_URL}/generate-video`;
    }
    return '/api/generate-video';
  },
  
  getVideoStatusUrl: (videoId: string) => {
    if (process.env.NODE_ENV === 'production') {
      return `${API_CONFIG.RAILWAY_API_URL}/video-status/${videoId}`;
    }
    return `/api/video-status/${videoId}`;
  },
  
  getVideoUrl: (videoId: string) => {
    if (process.env.NODE_ENV === 'production') {
      return `${API_CONFIG.RAILWAY_API_URL}/video/${videoId}`;
    }
    return `/api/videos/video_${videoId}.mp4`;
  }
}; 