import asyncio
import json
import os
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
import textwrap

app = FastAPI(title="Video Generation API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories for storing videos and status
# Use a directory that persists across restarts
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
VIDEO_DIR = DATA_DIR / "videos"
STATUS_DIR = DATA_DIR / "status"

# Create directories
for directory in [DATA_DIR, VIDEO_DIR, STATUS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)
    # Ensure directory is writable
    os.chmod(str(directory), 0o777)

print(f"Using data directories: VIDEO_DIR={VIDEO_DIR}, STATUS_DIR={STATUS_DIR}")

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

# Thread pool for CPU-intensive tasks
thread_pool = ThreadPoolExecutor(max_workers=2)

def create_text_image(text: str, size: tuple = (1080, 1920), font_size: int = 60) -> Image.Image:
    """Create a text image using PIL"""
    # Create a new image with a black background
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

def save_status(video_id: str, status: Dict[str, Any]):
    """Save video status to a file"""
    try:
        status_file = STATUS_DIR / f"{video_id}.json"
        with open(status_file, 'w') as f:
            json.dump(status, f)
        # Ensure file is readable
        os.chmod(str(status_file), 0o666)
        print(f"Saved status to {status_file}: {status}")
    except Exception as e:
        print(f"Error saving status: {e}")
        raise

def get_status(video_id: str) -> Optional[Dict[str, Any]]:
    """Get video status from file"""
    try:
        status_file = STATUS_DIR / f"{video_id}.json"
        if not status_file.exists():
            print(f"Status file not found: {status_file}")
            return None
        with open(status_file) as f:
            status = json.load(f)
            print(f"Read status from {status_file}: {status}")
            return status
    except Exception as e:
        print(f"Error reading status: {e}")
        return None

def update_progress(video_id: str, progress: int, status: str = "generating", error: Optional[str] = None):
    """Update video generation progress"""
    status_data = {
        "status": status,
        "progress": progress,
        "error": error,
        "videoUrl": f"/video/{video_id}" if status == "ready" else None
    }
    print(f"Updating progress for {video_id}: {status_data}")
    save_status(video_id, status_data)

def generate_simple_video(video_id: str, request: VideoRequest) -> str:
    """Generate a simple video using PIL and MoviePy"""
    try:
        from moviepy.editor import ColorClip, ImageClip, CompositeVideoClip
        import numpy as np
        
        # Update progress - Starting
        update_progress(video_id, 25)
        
        # Create text image
        update_progress(video_id, 35)
        text_content = f"Test Video\nSubreddit: {request.subreddit}"
        text_img = create_text_image(text_content)
        text_img_path = VIDEO_DIR / f"text_{video_id}.png"
        text_img.save(str(text_img_path))
        
        # Create background
        update_progress(video_id, 50)
        bg_clip = ColorClip(size=(1080, 1920), color=(0, 0, 0), duration=10)
        
        # Create text clip
        update_progress(video_id, 65)
        text_clip = ImageClip(str(text_img_path)).set_duration(10).set_position('center')
        
        # Composite video
        update_progress(video_id, 80)
        final_clip = CompositeVideoClip([bg_clip, text_clip])
        
        # Save video
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
        
        # Ensure video file is readable
        os.chmod(str(video_path), 0o666)
        
        # Clean up
        if text_img_path.exists():
            text_img_path.unlink()
        
        # Update progress - Complete
        update_progress(video_id, 100, "ready")
        return str(video_path)
        
    except Exception as e:
        print(f"Error generating video: {e}")
        update_progress(video_id, 0, "failed", str(e))
        raise

async def generate_video_async(video_id: str, request: VideoRequest):
    """Asynchronously generate video in a thread pool with timeout"""
    try:
        # Set initial status
        update_progress(video_id, 0)
        
        # Run video generation in thread pool with timeout
        loop = asyncio.get_event_loop()
        try:
            await asyncio.wait_for(
                loop.run_in_executor(
                    thread_pool,
                    generate_simple_video,
                    video_id,
                    request
                ),
                timeout=300  # 5 minutes timeout
            )
        except asyncio.TimeoutError:
            update_progress(video_id, 0, "failed", "Video generation timed out")
            raise HTTPException(status_code=500, detail="Video generation timed out")
            
    except Exception as e:
        error_msg = str(e)
        print(f"Error in generate_video_async: {error_msg}")
        update_progress(video_id, 0, "failed", error_msg)
        raise

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
        update_progress(video_id, 0, "failed", error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/video-status/{video_id}")
async def get_video_status(video_id: str):
    status = get_status(video_id)
    if not status:
        raise HTTPException(status_code=404, detail="Video not found")
    return status

@app.get("/video/{video_id}")
async def get_video(video_id: str):
    video_filename = f"video_{video_id}.mp4"
    video_path = VIDEO_DIR / video_filename
    
    print(f"Requested video: {video_path}")
    
    try:
        if not video_path.exists():
            print(f"Video file not found at {video_path}")
            # Check if video is still generating
            status = get_status(video_id)
            if status and status["status"] == "generating":
                print(f"Video {video_id} is still generating")
                return {
                    "status": "generating",
                    "message": "Video is still being generated"
                }
            
            print(f"Video {video_id} not found and not generating")
            raise HTTPException(status_code=404, detail="Video file not found")
        
        # Check file permissions
        print(f"Video file exists. Checking permissions...")
        try:
            with open(video_path, 'rb') as f:
                # Try to read first byte
                f.read(1)
            print(f"Video file is readable")
        except Exception as e:
            print(f"Error reading video file: {e}")
            raise HTTPException(status_code=500, detail=f"Error reading video file: {e}")
        
        print(f"Serving video file: {video_path}")
        return FileResponse(
            path=str(video_path),
            media_type="video/mp4",
            filename=video_filename
        )
    except Exception as e:
        print(f"Error serving video: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    # Check if data directories exist and are writable
    health_data = {
        "status": "ok",
        "service": "video-generation-api",
        "version": "1.0.0",
        "storage": {}
    }
    
    for name, path in [("data", DATA_DIR), ("videos", VIDEO_DIR), ("status", STATUS_DIR)]:
        try:
            # Check if directory exists
            exists = path.exists()
            # Check if directory is writable
            writable = os.access(str(path), os.W_OK)
            # Try to write a test file
            test_file = path / ".test"
            can_write = False
            try:
                test_file.touch()
                can_write = True
                test_file.unlink()
            except:
                pass
            
            health_data["storage"][name] = {
                "path": str(path),
                "exists": exists,
                "writable": writable,
                "can_write": can_write
            }
            
            if not (exists and writable and can_write):
                health_data["status"] = "warning"
        except Exception as e:
            health_data["storage"][name] = {
                "path": str(path),
                "error": str(e)
            }
            health_data["status"] = "error"
    
    return health_data

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting FastAPI server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port) 