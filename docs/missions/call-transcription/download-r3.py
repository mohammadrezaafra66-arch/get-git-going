#!/usr/bin/env python3
"""Download R3 models + FLEURS fa_ir test clips. Logs to D:\\afrakala-stt\\download-r3.log.
Never prints secrets. Stop with URL + error if a source is unreachable.
"""

from __future__ import annotations

import sys
import tarfile
import traceback
from pathlib import Path

LOG = Path(r"D:\afrakala-stt\download-r3.log")
MODELS = Path(r"D:\afrakala-stt\models")
EVAL = Path(r"D:\afrakala-stt\eval")
SRC = Path(r"D:\afrakala-stt\eval\_fleurs_src")


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    line = msg.rstrip() + "\n"
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line)
        fh.flush()
    print(line, end="", flush=True)


def fail(url: str, err: str, manual: str) -> None:
    log("STOP_UNREACHABLE")
    log(f"URL {url}")
    log(f"ERROR {err}")
    log(f"MANUAL {manual}")
    sys.exit(3)


def main() -> int:
    LOG.write_text("R3_DOWNLOAD_START\n", encoding="utf-8")
    try:
        from huggingface_hub import snapshot_download, hf_hub_download
    except Exception as exc:  # noqa: BLE001
        fail(
            "https://pypi.org/project/huggingface_hub/",
            str(exc),
            "python -m pip install huggingface_hub",
        )

    MODELS.mkdir(parents=True, exist_ok=True)
    EVAL.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)

    large = MODELS / "farsi-faster-whisper-large-v3"
    if not ((large / "model.bin").exists() or (large / "model.bin").exists()):
        log("DOWNLOAD oi-uae/farsi-faster-whisper-large-v3")
        try:
            snapshot_download(
                repo_id="oi-uae/farsi-faster-whisper-large-v3",
                local_dir=str(large),
            )
        except Exception as exc:  # noqa: BLE001
            fail(
                "https://huggingface.co/oi-uae/farsi-faster-whisper-large-v3",
                f"{type(exc).__name__}: {exc}",
                r"python -c \"from huggingface_hub import snapshot_download; snapshot_download('oi-uae/farsi-faster-whisper-large-v3', local_dir=r'D:\\afrakala-stt\\models\\farsi-faster-whisper-large-v3')\"",
            )
    log(f"LARGE_OK exists={ (large / 'model.bin').exists() }")

    small_src = MODELS / "_src" / "whisper-small-persian"
    if not (small_src / "config.json").exists():
        log("DOWNLOAD AmirMohseni/whisper-small-persian")
        try:
            snapshot_download(
                repo_id="AmirMohseni/whisper-small-persian",
                local_dir=str(small_src),
            )
        except Exception as exc:  # noqa: BLE001
            fail(
                "https://huggingface.co/AmirMohseni/whisper-small-persian",
                f"{type(exc).__name__}: {exc}",
                r"python -c \"from huggingface_hub import snapshot_download; snapshot_download('AmirMohseni/whisper-small-persian', local_dir=r'D:\\afrakala-stt\\models\\_src\\whisper-small-persian')\"",
            )
    log("SMALL_SRC_OK")

    tsv = SRC / "data" / "fa_ir" / "test.tsv"
    tar = SRC / "data" / "fa_ir" / "audio" / "test.tar.gz"
    if not tsv.exists():
        log("DOWNLOAD google/fleurs data/fa_ir/test.tsv")
        try:
            hf_hub_download(
                repo_id="google/fleurs",
                repo_type="dataset",
                filename="data/fa_ir/test.tsv",
                local_dir=str(SRC),
            )
        except Exception as exc:  # noqa: BLE001
            fail(
                "https://huggingface.co/datasets/google/fleurs/resolve/main/data/fa_ir/test.tsv",
                f"{type(exc).__name__}: {exc}",
                r"huggingface-cli download google/fleurs --repo-type dataset --include data/fa_ir/test.tsv --local-dir D:\afrakala-stt\eval\_fleurs_src",
            )
    if not tar.exists():
        log("DOWNLOAD google/fleurs data/fa_ir/audio/test.tar.gz")
        try:
            hf_hub_download(
                repo_id="google/fleurs",
                repo_type="dataset",
                filename="data/fa_ir/audio/test.tar.gz",
                local_dir=str(SRC),
            )
        except Exception as exc:  # noqa: BLE001
            fail(
                "https://huggingface.co/datasets/google/fleurs/resolve/main/data/fa_ir/audio/test.tar.gz",
                f"{type(exc).__name__}: {exc}",
                r"huggingface-cli download google/fleurs --repo-type dataset --include data/fa_ir/audio/test.tar.gz --local-dir D:\afrakala-stt\eval\_fleurs_src",
            )
    log(f"FLEURS_SRC_OK tsv={tsv.exists()} tar={tar.exists()} tar_bytes={tar.stat().st_size if tar.exists() else 0}")
    log("R3_DOWNLOAD_DONE")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        log(traceback.format_exc())
        raise
