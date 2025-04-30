# app/utils/cache_utils.py
import os
import time
import hashlib
import json
from datetime import datetime
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


class CacheManager:
    """
    Utility for managing static asset cache versions.
    Generates a unique version identifier for cache busting.
    """

    def __init__(self):
        self.version = self._generate_version()
        self.timestamp = int(time.time())
        self._save_version()
        logger.info(f"Initialized cache manager with version: {self.version}")

    def _generate_version(self):
        """Generate a unique cache version string"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_component = os.urandom(4).hex()
        return f"{timestamp}-{random_component}"

    def _save_version(self):
        """Save the current version to a file for service worker access"""
        try:
            static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
            os.makedirs(static_dir, exist_ok=True)

            cache_file = os.path.join(static_dir, "cache_version.json")
            with open(cache_file, "w") as f:
                json.dump({
                    "version": self.version,
                    "timestamp": self.timestamp
                }, f)
        except Exception as e:
            logger.error(f"Failed to save cache version: {e}")

    def get_version(self):
        """Get the current cache version"""
        return self.version

    def versioned_url(self, path):
        """
        Generate a versioned URL for a static resource

        Args:
            path: Path to the static resource (relative to static directory)

        Returns:
            str: URL with cache-busting version parameter
        """
        # Strip any existing version params to avoid duplication
        if "?" in path:
            base_path = path.split("?")[0]
            return f"{base_path}?v={self.version}"
        return f"{path}?v={self.version}"


# Create singleton instance
cache_manager = CacheManager()