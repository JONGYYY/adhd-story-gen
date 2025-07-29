#!/usr/bin/env python3
"""
Standalone FastAPI service for Railway deployment
This is a minimal video generation API that doesn't depend on the existing project structure
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import uuid
from pathlib import Path
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

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

# In-memory storage for video status
video_status = {}

# Thread pool for CPU-intensive tasks
thread_pool = ThreadPoolExecutor(max_workers=2)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "service": "video-generation-api",
        "version": "1.0.0"
    }

@app.get("/test-imports")
async def test_imports():
    """Test if all required modules can be imported"""
    try:
        import moviepy
        import openai
        import numpy
        from PIL import Image, ImageDraw, ImageFont
        
        return {
            "status": "success",
            "modules": {
                "moviepy": str(moviepy.__version__),
                "openai": "available",
                "numpy": str(numpy.__version__),
                "pillow": "available"
            },
            "environment": {
                "python_version": f"{os.sys.version}",
                "video_dir": str(VIDEO_DIR),
                "video_dir_exists": VIDEO_DIR.exists()
            }
        }
    except ImportError as e:
        return {
            "status": "error",
            "error": str(e),
            "environment": {
                "python_version": f"{os.sys.version}",
                "video_dir": str(VIDEO_DIR)
            }
        }

def create_text_image(text: str, size: tuple = (1080, 1920), font_size: int = 60) -> 'PIL.Image.Image':
    """Create an image with text using PIL instead of MoviePy TextClip"""
    from PIL import Image, ImageDraw, ImageFont
    import textwrap
    
    # Create a black image
    img = Image.new('RGB', size, color='black')
    draw = ImageDraw.Draw(img)
    
    # Try to use a default font, fallback to built-in if needed
    try:
        # Try to load a system font
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except (OSError, IOError):
        try:
            # Fallback to default font
            font = ImageFont.load_default()
        except:
            font = None
    
    # Wrap text to fit the image
    wrapper = textwrap.TextWrapper(width=30)  # Adjust width as needed
    wrapped_text = wrapper.fill(text)
    
    # Calculate text position (center)
    if font:
        bbox = draw.textbbox((0, 0), wrapped_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    else:
        # Estimate size if no font available
        text_width = len(wrapped_text.split('\n')[0]) * 10
        text_height = len(wrapped_text.split('\n')) * 20
    
    x = (size[0] - text_width) // 2
    y = (size[1] - text_height) // 2
    
    # Draw text
    draw.text((x, y), wrapped_text, fill='white', font=font, align='center')
    
    return img

def generate_simple_video(video_id: str, subreddit: str) -> str:
    """Generate a simple video using PIL and MoviePy without TextClip"""
    try:
        from moviepy.editor import ColorClip, ImageClip, CompositeVideoClip
        import numpy as np
        
        # Create a simple test video
        duration = 10  # 10 seconds
        
        # Create text image using PIL
        text_content = f"Test Video\nSubreddit: {subreddit}\nVideo ID: {video_id[:8]}..."
        text_img = create_text_image(text_content, size=(1080, 1920), font_size=50)
        
        # Save text image temporarily
        text_img_path = VIDEO_DIR / f"text_{video_id}.png"
        text_img.save(str(text_img_path))
        
        # Create a background color clip
        bg_clip = ColorClip(size=(1080, 1920), color=(0, 0, 0), duration=duration)
        
        # Create image clip from our text image
        text_clip = ImageClip(str(text_img_path)).set_duration(duration).set_position('center')
        
        # Composite the clips
        final_clip = CompositeVideoClip([bg_clip, text_clip])
        
        # Save the video
        video_path = VIDEO_DIR / f"video_{video_id}.mp4"
        final_clip.write_videofile(
            str(video_path),
            fps=24,
            codec='libx264',
            audio_codec='aac',
            verbose=False,
            logger=None,
            temp_audiofile=None,
            remove_temp=True
        )
        
        # Clean up temporary image
        if text_img_path.exists():
            text_img_path.unlink()
        
        return str(video_path)
        
    except Exception as e:
        print(f"Error generating video: {e}")
        raise

async def generate_video_async(video_id: str, request: VideoRequest):
    """Asynchronously generate video in a thread pool"""
    try:
        # Update status to generating
        video_status[video_id] = {
            "status": "generating",
            "progress": 25,
            "error": None,
            "videoUrl": None
        }
        
        # Run video generation in thread pool
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            thread_pool,
            generate_simple_video,
            video_id,
            request.subreddit
        )
        
        # Update status to ready
        video_status[video_id] = {
            "status": "ready",
            "progress": 100,
            "error": None,
            "videoUrl": f"/video/{video_id}"
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error in generate_video_async: {error_msg}")
        video_status[video_id] = {
            "status": "failed",
            "progress": 0,
            "error": error_msg,
            "videoUrl": None
        }

@app.post("/generate-video", response_model=VideoResponse)
async def generate_video(request: VideoRequest):
    video_id = str(uuid.uuid4())
    
    try:
        # Start video generation in background
        asyncio.create_task(generate_video_async(video_id, request))
        
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
        # Check if video is still generating
        if video_id in video_status and video_status[video_id]["status"] == "generating":
            return {
                "status": "generating",
                "message": "Video is still being generated"
            }
        
        raise HTTPException(status_code=404, detail="Video file not found")
    
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=video_filename
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting FastAPI server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port) 