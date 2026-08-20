"""Fail-fast per-conversation leases for process-local request serialization."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class ThreadBusy(RuntimeError):
    """Raised when another request already owns a conversation thread."""


class ThreadLockPool:
    """Lease a thread without queuing while allowing unrelated threads concurrently."""

    def __init__(self) -> None:
        self._active: set[str] = set()
        self._registry_lock = asyncio.Lock()

    @asynccontextmanager
    async def hold(self, thread_id: str) -> AsyncIterator[None]:
        await self._acquire(thread_id)
        try:
            yield
        finally:
            await self._release_safely(thread_id)

    async def _acquire(self, thread_id: str) -> None:
        async with self._registry_lock:
            if thread_id in self._active:
                raise ThreadBusy("Conversation thread is already active")
            self._active.add(thread_id)

    async def _release_safely(self, thread_id: str) -> None:
        release = asyncio.create_task(self._release(thread_id))
        cancelled = False
        while not release.done():
            try:
                await asyncio.shield(release)
            except asyncio.CancelledError:
                cancelled = True
        release.result()
        if cancelled:
            raise asyncio.CancelledError

    async def _release(self, thread_id: str) -> None:
        async with self._registry_lock:
            self._active.discard(thread_id)
