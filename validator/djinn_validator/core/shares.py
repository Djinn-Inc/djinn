"""Key share storage and management.

Each Genius signal has its encryption key split into 10 Shamir shares,
distributed across validators. This module manages a validator's local
share store with SQLite persistence.
"""

from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path

import structlog

from djinn_validator.utils.crypto import Share

log = structlog.get_logger()


@dataclass
class SignalShareRecord:
    """A validator's share for a single signal."""

    signal_id: str
    genius_address: str
    share: Share
    encrypted_key_share: bytes  # Share of the AES key, encrypted to this validator
    stored_at: float = field(default_factory=time.time)
    released_to: set[str] = field(default_factory=set)


class ShareStore:
    """SQLite-backed store for signal key shares held by this validator.

    Falls back to in-memory SQLite when no db_path is provided (useful for tests).
    """

    _MAX_CONNECT_RETRIES = 3

    def __init__(self, db_path: str | Path | None = None) -> None:
        if db_path is not None:
            path = Path(db_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            self._conn = self._connect_with_retry(str(path))
        else:
            self._conn = sqlite3.connect(":memory:", check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._create_tables()

    @staticmethod
    def _connect_with_retry(path: str) -> sqlite3.Connection:
        """Connect to SQLite with retry on OperationalError."""
        for attempt in range(ShareStore._MAX_CONNECT_RETRIES):
            try:
                return sqlite3.connect(path, check_same_thread=False)
            except sqlite3.OperationalError:
                if attempt == ShareStore._MAX_CONNECT_RETRIES - 1:
                    raise
                delay = 2 ** attempt
                log.warning("db_connect_retry", attempt=attempt + 1, delay_s=delay, path=path)
                time.sleep(delay)
        raise RuntimeError("unreachable")

    def _create_tables(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS shares (
                signal_id TEXT PRIMARY KEY,
                genius_address TEXT NOT NULL,
                share_x INTEGER NOT NULL,
                share_y TEXT NOT NULL,
                encrypted_key_share BLOB NOT NULL,
                stored_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS releases (
                signal_id TEXT NOT NULL,
                buyer_address TEXT NOT NULL,
                released_at REAL NOT NULL,
                PRIMARY KEY (signal_id, buyer_address),
                FOREIGN KEY (signal_id) REFERENCES shares(signal_id) ON DELETE CASCADE
            );
        """)
        self._conn.commit()

    def store(
        self,
        signal_id: str,
        genius_address: str,
        share: Share,
        encrypted_key_share: bytes,
    ) -> None:
        """Store a new key share for a signal."""
        try:
            self._conn.execute(
                "INSERT INTO shares (signal_id, genius_address, share_x, share_y, encrypted_key_share, stored_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (signal_id, genius_address, share.x, str(share.y), encrypted_key_share, time.time()),
            )
            self._conn.commit()
            log.info("share_stored", signal_id=signal_id, genius=genius_address)
        except sqlite3.IntegrityError:
            log.warning("share_already_stored", signal_id=signal_id)

    def get(self, signal_id: str) -> SignalShareRecord | None:
        """Retrieve a share record by signal ID."""
        row = self._conn.execute(
            "SELECT signal_id, genius_address, share_x, share_y, encrypted_key_share, stored_at "
            "FROM shares WHERE signal_id = ?",
            (signal_id,),
        ).fetchone()
        if row is None:
            return None

        released = {
            r[0] for r in self._conn.execute(
                "SELECT buyer_address FROM releases WHERE signal_id = ?",
                (signal_id,),
            ).fetchall()
        }

        return SignalShareRecord(
            signal_id=row[0],
            genius_address=row[1],
            share=Share(x=row[2], y=int(row[3])),
            encrypted_key_share=row[4],
            stored_at=row[5],
            released_to=released,
        )

    def has(self, signal_id: str) -> bool:
        """Check if we hold a share for this signal."""
        row = self._conn.execute(
            "SELECT 1 FROM shares WHERE signal_id = ? LIMIT 1",
            (signal_id,),
        ).fetchone()
        return row is not None

    def release(self, signal_id: str, buyer_address: str) -> bytes | None:
        """Release the encrypted key share to a buyer.

        Returns the encrypted key share bytes, or None if not found.
        Records the release to prevent double-claiming.
        Uses a transaction to ensure atomicity of check+insert.
        """
        row = self._conn.execute(
            "SELECT encrypted_key_share FROM shares WHERE signal_id = ?",
            (signal_id,),
        ).fetchone()
        if row is None:
            log.warning("share_not_found", signal_id=signal_id)
            return None

        encrypted_key_share = row[0]

        # Atomic check+insert within a transaction
        try:
            self._conn.execute("BEGIN IMMEDIATE")
            existing = self._conn.execute(
                "SELECT 1 FROM releases WHERE signal_id = ? AND buyer_address = ?",
                (signal_id, buyer_address),
            ).fetchone()
            if existing:
                self._conn.execute("COMMIT")
                log.info("share_already_released", signal_id=signal_id, buyer=buyer_address)
                return encrypted_key_share

            self._conn.execute(
                "INSERT INTO releases (signal_id, buyer_address, released_at) VALUES (?, ?, ?)",
                (signal_id, buyer_address, time.time()),
            )
            self._conn.execute("COMMIT")
            log.info("share_released", signal_id=signal_id, buyer=buyer_address)
            return encrypted_key_share
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def remove(self, signal_id: str) -> None:
        """Remove a share (e.g., signal voided or expired)."""
        self._conn.execute("DELETE FROM releases WHERE signal_id = ?", (signal_id,))
        self._conn.execute("DELETE FROM shares WHERE signal_id = ?", (signal_id,))
        self._conn.commit()

    @property
    def count(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) FROM shares").fetchone()
        return row[0] if row else 0

    def active_signals(self) -> list[str]:
        """List all signal IDs we hold shares for."""
        rows = self._conn.execute("SELECT signal_id FROM shares").fetchall()
        return [r[0] for r in rows]

    def close(self) -> None:
        """Close the database connection."""
        self._conn.close()
