#!/usr/bin/env python3
"""
Main entry point for Railway deployment - uses standalone API
"""
import os
import sys
from pathlib import Path

# Add current directory to Python path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Import and run the standalone FastAPI app
from api_standalone import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting standalone FastAPI server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port) 