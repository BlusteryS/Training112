"""Private local IPC: uint32 frame size, one-byte kind, binary payload."""

import struct

FRAME_SIZE = struct.Struct("<I")
SAMPLE_RATE = struct.Struct("<I")
MAX_FRAME_BYTES = 32 * 1024 * 1024


def frame(kind: bytes, payload: bytes = b"") -> bytes:
    if len(kind) != 1 or len(payload) + 1 > MAX_FRAME_BYTES:
        raise ValueError("Некорректный кадр TTS")
    return FRAME_SIZE.pack(len(payload) + 1) + kind + payload
