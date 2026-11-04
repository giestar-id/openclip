"""Clipper Worker Package."""
from __future__ import annotations

import os

# 1. Matikan peringatan symlink HuggingFace di Windows sebelum library terkait di-import
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# 2. Patch kompatibilitas PyAV >= 14/19 dengan faster-whisper.
# PyAV versi terbaru menghapus parameter 'metadata_errors' dari av.open,
# sementara faster-whisper memanggil av.open(..., metadata_errors="ignore").
try:
    import av

    _orig_av_open = av.open

    def _safe_av_open(*args, **kwargs):
        try:
            return _orig_av_open(*args, **kwargs)
        except TypeError as err:
            if "metadata_errors" in str(err):
                kwargs.pop("metadata_errors", None)
                return _orig_av_open(*args, **kwargs)
            raise

    av.open = _safe_av_open
except ImportError:
    pass
