"""Estimate the next free slot from recent completed calls on this node."""

from collections.abc import Collection, Sequence
from math import ceil
from statistics import median


def estimate_wait_seconds(
    started_at: Sequence[float | None], durations: Collection[float], now: float
) -> int:
    if not started_at:
        return 5
    # Cold-start prior until this node has observed its first completed call.
    expected = median(durations) if durations else 180
    return max(5, ceil(min(
        expected - max(0, now - started) if started is not None else 5
        for started in started_at
    )))
