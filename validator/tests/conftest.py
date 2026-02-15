"""Shared test fixtures for the validator test suite."""

from __future__ import annotations

import os

# Ensure tests don't fail due to .env loading BT_NETWORK=finney.
# Tests should work regardless of the local .env file.
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
