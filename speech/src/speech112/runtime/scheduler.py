"""A bounded executor whose capacity remains occupied until native work actually stops."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any


class Overloaded(RuntimeError):
    pass


class InferenceScheduler:
    def __init__(self, workers: int, queue_size: int):
        if workers < 1 or queue_size < 0:
            raise ValueError("Invalid inference scheduler limits")
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="inference")
        self._limit = workers + queue_size
        self._pending = 0
        self._closed = False
        self._idle = asyncio.Event()
        self._idle.set()

    @property
    def pending(self) -> int:
        return self._pending

    async def run(self, function, *args, **kwargs) -> Any:
        if self._closed or self._pending >= self._limit:
            raise Overloaded("Inference capacity exceeded")
        self._pending += 1
        self._idle.clear()
        future = asyncio.get_running_loop().run_in_executor(
            self._executor, partial(function, *args, **kwargs)
        )

        def completed(result):
            self._pending -= 1
            # Retrieve errors even if the requesting conversation has been cancelled.
            if not result.cancelled():
                result.exception()
            if not self._pending:
                self._idle.set()

        future.add_done_callback(completed)
        # Cancelling a coroutine cannot cancel an already running ONNX/PyTorch call.
        return await asyncio.shield(future)

    async def close(self) -> None:
        self._closed = True
        await self._idle.wait()
        self._executor.shutdown(wait=False, cancel_futures=True)
