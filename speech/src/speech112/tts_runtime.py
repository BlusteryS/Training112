from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from speech112.config import AppConfig
from speech112.qwen_tts import QwenSynthesizer


@asynccontextmanager
async def open_tts(config: AppConfig) -> AsyncIterator[QwenSynthesizer]:
    runtime = await QwenSynthesizer.start(config.tts, config.voices)
    try:
        yield runtime
    finally:
        await runtime.close()
