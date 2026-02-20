"""SQLite ledger for consumed alpha burn transactions.

Prevents double-spend by tracking which extrinsic hashes have already been
used to pay for attestation requests.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path

import structlog

log = structlog.get_logger()


class BurnLedger:
    """SQLite-backed ledger of consumed alpha burn transactions.

    Follows the same pattern as ShareStore for SQLite lifecycle management.
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._lock = threading.Lock()
        if db_path is not None:
            path = Path(db_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            self._conn = sqlite3.connect(str(path), check_same_thread=False)
        else:
            self._conn = sqlite3.connect(":memory:", check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._create_tables()

    def _create_tables(self) -> None:
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS consumed_burns (
                tx_hash    TEXT PRIMARY KEY,
                coldkey    TEXT NOT NULL,
                amount     REAL NOT NULL,
                consumed_at INTEGER NOT NULL
            )
        """)
        self._conn.commit()

    def is_consumed(self, tx_hash: str) -> bool:
        """Check whether a burn transaction hash has already been used."""
        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM consumed_burns WHERE tx_hash = ?", (tx_hash,)
            ).fetchone()
            return row is not None

    def record_burn(self, tx_hash: str, coldkey: str, amount: float) -> bool:
        """Record a consumed burn transaction.

        Returns True if the burn was recorded successfully.
        Returns False if the tx_hash was already consumed (double-spend attempt).
        """
        with self._lock:
            try:
                self._conn.execute(
                    "INSERT INTO consumed_burns (tx_hash, coldkey, amount, consumed_at) VALUES (?, ?, ?, ?)",
                    (tx_hash, coldkey, amount, int(time.time())),
                )
                self._conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False

    def close(self) -> None:
        """Close the database connection."""
        try:
            self._conn.close()
        except Exception:
            pass
