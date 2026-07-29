"""Small in-process cost guard for the public chat endpoint."""

import asyncio
import time
from collections import defaultdict, deque


class RateLimitExceeded(RuntimeError):
    """Raised when one client exceeds the configured sliding window."""


class SlidingWindowRateLimiter:
    """Bound requests per client without adding an external service to the prototype."""

    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        if limit < 1 or window_seconds <= 0:
            raise ValueError("Rate-limit values must be positive")
        self._limit = limit
        self._window_seconds = window_seconds
        self._requests: defaultdict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, client_id: str) -> None:
        """Record one request or reject it when the window is full."""
        now = time.monotonic()
        cutoff = now - self._window_seconds
        async with self._lock:
            requests = self._requests[client_id]
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self._limit:
                raise RateLimitExceeded("Chat request rate limit exceeded")
            requests.append(now)
