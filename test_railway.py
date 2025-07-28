#!/usr/bin/env python3
"""
Simple test script to verify Railway Python setup
"""
import sys
import os
from pathlib import Path

print("=== Railway Python Test ===")
print(f"Python version: {sys.version}")
print(f"Current directory: {os.getcwd()}")
print(f"Python path: {sys.path}")

# Test basic imports
try:
    import fastapi
    print(f"✓ FastAPI version: {fastapi.__version__}")
except ImportError as e:
    print(f"✗ FastAPI import failed: {e}")

try:
    import uvicorn
    print(f"✓ Uvicorn available")
except ImportError as e:
    print(f"✗ Uvicorn import failed: {e}")

try:
    import moviepy
    print(f"✓ MoviePy version: {moviepy.__version__}")
except ImportError as e:
    print(f"✗ MoviePy import failed: {e}")

try:
    import openai
    print(f"✓ OpenAI available")
except ImportError as e:
    print(f"✗ OpenAI import failed: {e}")

# Test file structure
project_root = Path(__file__).parent
print(f"\nProject root: {project_root}")

api_file = project_root / "src" / "app" / "api" / "video.py"
print(f"API file exists: {api_file.exists()}")

print("\n=== Test Complete ===") 