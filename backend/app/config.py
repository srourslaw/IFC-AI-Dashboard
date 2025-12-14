"""
Application configuration settings.
"""
import os
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Settings
    API_TITLE: str = "IFC AI POC API"
    API_VERSION: str = "1.0.0"
    API_DESCRIPTION: str = "Enterprise-grade API for IFC building model analysis"

    # CORS Settings - includes Vercel deployment URLs
    CORS_ORIGINS: List[str] = [
        "http://localhost:5176",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5176",
        "https://ifc-ai-dashboard.vercel.app",
        "https://ifc-ai-dashboard-hussein-srours-projects.vercel.app",
        "https://ifc-ai-dashboard-a14quqmhq-hussein-srours-projects.vercel.app",
        "https://*.vercel.app",  # Allow all Vercel preview URLs
    ]

    # File Settings - uploads folder for IFC files
    IFC_DIRECTORY: Path = Path(__file__).parent.parent.parent / "uploads"
    ALLOWED_EXTENSIONS: List[str] = [".ifc"]
    MAX_FILE_SIZE_MB: int = 500

    # Output Directories - all outputs go to outputs folder
    OUTPUT_DIRECTORY: Path = Path(__file__).parent.parent.parent / "outputs"
    TAKEOFFS_DIR: str = "takeoffs"
    STOREY_IFCS_DIR: str = "storey_ifcs"
    EXPORTS_DIR: str = "exports"

    # OpenAI Settings (optional, for AI features)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4.1-mini"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
