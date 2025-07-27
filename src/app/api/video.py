from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path

# Add the project root to Python path
sys.path.append(str(Path(__file__).parent.parent.parent.parent))

# Import our existing video generation modules
from lib.video_generator.moviepy_generator import generate_moviepy_video
from lib.story_generator.openai import generate_story
from lib.video_generator.types import VideoOptions, SubredditStory, VideoGenerationOptions

app = FastAPI(title="Video Generation API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a directory for storing videos
VIDEO_DIR = Path("/tmp/videos")
VIDEO_DIR.mkdir(exist_ok=True)

class VideoRequest(BaseModel):
    subreddit: str
    isCliffhanger: bool = False
    voice: Dict[str, Any]
    background: Dict[str, Any]
    customStory: Optional[Dict[str, Any]] = None

class VideoResponse(BaseModel):
    success: bool
    videoId: str
    videoUrl: Optional[str] = None
    error: Optional[str] = None

# In-memory storage for video status (Railway has persistent storage)
video_status = {}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "video-generation-api"}

@app.post("/generate-video", response_model=VideoResponse)
async def generate_video(request: VideoRequest):
    video_id = str(uuid.uuid4())
    
    try:
        # Generate or use custom story
        if request.customStory:
            story = SubredditStory(
                title=request.customStory["title"],
                story=request.customStory["story"],
                subreddit=request.customStory.get("subreddit", "r/stories"),
                author="Anonymous"
            )
        else:
            # Ensure subreddit has r/ prefix
            subreddit = request.subreddit if request.subreddit.startswith('r/') else f"r/{request.subreddit}"
            
            story = await generate_story({
                "subreddit": subreddit,
                "isCliffhanger": request.isCliffhanger,
                "narratorGender": request.voice["gender"]
            })

        # Validate story data
        if not story.title or not story.story:
            raise HTTPException(status_code=400, detail="Story is missing required fields")

        # Create video generation options
        options = VideoGenerationOptions(
            subreddit=request.subreddit,
            isCliffhanger=request.isCliffhanger,
            voice=request.voice,
            background=request.background,
            story=story
        )

        # Initialize video status
        video_status[video_id] = {
            "status": "processing",
            "progress": 0,
            "error": None,
            "videoUrl": None
        }

        # Generate video (this will be synchronous for Railway)
        output_path = await generate_moviepy_video(options, video_id)
        
        # Copy the generated video to our video directory
        video_filename = f"video_{video_id}.mp4"
        video_path = VIDEO_DIR / video_filename
        
        # If the video was generated in /tmp, copy it to our video directory
        if os.path.exists(output_path):
            import shutil
            shutil.copy2(output_path, video_path)
        
        # Update status to ready
        video_status[video_id] = {
            "status": "ready",
            "progress": 100,
            "error": None,
            "videoUrl": f"/video/{video_id}"
        }

        return VideoResponse(
            success=True,
            videoId=video_id,
            videoUrl=f"/video/{video_id}"
        )

    except Exception as e:
        error_msg = str(e)
        video_status[video_id] = {
            "status": "failed",
            "progress": 0,
            "error": error_msg,
            "videoUrl": None
        }
        
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/video-status/{video_id}")
async def get_video_status(video_id: str):
    if video_id not in video_status:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return video_status[video_id]

@app.get("/video/{video_id}")
async def get_video(video_id: str):
    video_filename = f"video_{video_id}.mp4"
    video_path = VIDEO_DIR / video_filename
    
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=video_filename
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000))) 