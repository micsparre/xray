import os
import fnmatch
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# File exclusion patterns – these are NOT knowledge moats.
# Patterns use fnmatch-style globbing against the full relative path.
# ---------------------------------------------------------------------------
EXCLUDED_FILE_PATTERNS: list[str] = [
    # Lock / generated dependency files
    "*.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "requirements.txt",
    "Pipfile.lock",
    "composer.lock",
    "Gemfile.lock",
    "go.sum",
    "poetry.lock",
    # Documentation
    "*.md",
    "*.rst",
    "*.txt",
    "docs/*",
    "doc/*",
    "CHANGELOG*",
    "CHANGES*",
    "LICENSE*",
    "COPYING*",
    "AUTHORS*",
    "CONTRIBUTORS*",
    # CI / CD
    ".github/*",
    ".gitlab-ci.yml",
    ".travis.yml",
    "Jenkinsfile",
    ".circleci/*",
    # IDE / editor / OS / repo config
    ".vscode/*",
    ".idea/*",
    ".DS_Store",
    ".editorconfig",
    ".gitignore",
    ".gitattributes",
    ".mailmap",
    ".pre-commit-config.yaml",
    ".prettierrc*",
    ".eslintrc*",
    ".stylelintrc*",
    ".browserslistrc",
    # Generated / minified assets
    "*.min.js",
    "*.min.css",
    "*.map",
    "vendor/*",
    "node_modules/*",
    # Images / binaries (git numstat shows "-" for these, but just in case)
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.ico",
    "*.svg",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.eot",
]


def is_excluded_file(path: str) -> bool:
    """Return True if `path` matches any exclusion pattern."""
    for pattern in EXCLUDED_FILE_PATTERNS:
        if fnmatch.fnmatch(path, pattern):
            return True
        # Also match against the basename for extension patterns
        basename = path.rsplit("/", 1)[-1]
        if fnmatch.fnmatch(basename, pattern):
            return True
    return False

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-6")
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

# Production hardening
MAX_CONCURRENT_ANALYSES = int(os.getenv("MAX_CONCURRENT_ANALYSES", "3"))
MAX_REPO_SIZE_MB = int(os.getenv("MAX_REPO_SIZE_MB", "500"))
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "5"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "3600"))
