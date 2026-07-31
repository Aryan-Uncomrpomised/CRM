import sys
import os
from pathlib import Path

# Add backend directory to sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(root_dir / "backend"))

from mangum import Mangum
from server import app

# Serverless handler for Netlify
handler = Mangum(app)
