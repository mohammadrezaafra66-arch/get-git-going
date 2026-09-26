"""AES-256-GCM decrypt for torob_ops_accounts.session_ciphertext (same as crypto.server.ts)."""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def account_secret_key() -> bytes:
    raw = (
        os.environ.get("TOROB_OPS_ACCOUNT_SECRET")
        or os.environ.get("JWT_SECRET")
        or "torob-ops-dev-only-insecure-key"
    )
    return hashlib.sha256(raw.encode("utf-8")).digest()


def decrypt_account_session(ciphertext_b64: str, iv_b64: str) -> str:
    buf = base64.b64decode(ciphertext_b64)
    iv = base64.b64decode(iv_b64)
    tag = buf[-16:]
    data = buf[:-16]
    aes = AESGCM(account_secret_key())
    return aes.decrypt(iv, data + tag, None).decode("utf-8")
