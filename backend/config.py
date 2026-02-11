import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-4-opus-20250514")
CLONE_BASE_DIR = os.getenv("CLONE_BASE_DIR", "/tmp/xray-repos")
DEFAULT_MONTHS = int(os.getenv("DEFAULT_MONTHS", "6"))
MAX_CONCURRENT_AI = int(os.getenv("MAX_CONCURRENT_AI", "5"))
MAX_PRS_CODE_ANALYSIS = int(os.getenv("MAX_PRS_CODE_ANALYSIS", "30"))
MAX_PRS_REVIEW_ANALYSIS = int(os.getenv("MAX_PRS_REVIEW_ANALYSIS", "20"))
MAX_BLAME_FILES = int(os.getenv("MAX_BLAME_FILES", "30"))
DIFF_TRUNCATE_CHARS = int(os.getenv("DIFF_TRUNCATE_CHARS", "8000"))
AI_CALL_TIMEOUT = int(os.getenv("AI_CALL_TIMEOUT", "60"))
PATTERN_THINKING_BUDGET = int(os.getenv("PATTERN_THINKING_BUDGET", "10000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(",")
