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
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

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
    return {"status": "healthy", "service": "video-generation-api", "python_path": str(project_root)}

@app.get("/test-imports")
async def test_imports():
    """Test if all required modules can be imported"""
    try:
        # Test basic imports
        import moviepy
        import openai
        import numpy
        
        return {
            "status": "success",
            "modules": {
                "moviepy": moviepy.__version__,
                "openai": "available",
                "numpy": numpy.__version__
            }
        }
    except ImportError as e:
        return {
            "status": "error",
            "error": str(e),
            "python_path": str(project_root),
            "sys_path": sys.path
        }

@app.post("/generate-video", response_model=VideoResponse)
async def generate_video(request: VideoRequest):
    video_id = str(uuid.uuid4())
    
    try:
        # For now, return a test response to see if the endpoint works
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
        # Return a test response for now
        return {"message": "Video endpoint working", "video_id": video_id, "path": str(video_path)}
    
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=video_filename
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000))) 