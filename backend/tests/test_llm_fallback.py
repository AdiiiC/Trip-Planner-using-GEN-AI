from types import SimpleNamespace

import pytest

from agents import llm


class FakeStream:
    def __init__(self, chunks=None, error=None):
        self.chunks = chunks or []
        self.error = error

    async def astream(self, messages):
        if self.error:
            raise self.error
        for chunk in self.chunks:
            yield SimpleNamespace(content=chunk)


@pytest.mark.asyncio
async def test_stream_falls_back_before_output(monkeypatch):
    monkeypatch.setattr(llm, "get_llm", lambda **kwargs: FakeStream(error=RuntimeError("model retired")))
    monkeypatch.setattr(
        llm,
        "_get_fallback_llm",
        lambda **kwargs: FakeStream(chunks=["fallback ", "worked"]),
    )

    chunks = [chunk async for chunk in llm.astream_with_fallback([])]
    assert chunks == ["fallback ", "worked"]


@pytest.mark.asyncio
async def test_stream_reports_no_available_provider(monkeypatch):
    monkeypatch.setattr(llm, "get_llm", lambda **kwargs: FakeStream(error=RuntimeError("model retired")))
    monkeypatch.setattr(llm, "_get_fallback_llm", lambda **kwargs: None)

    with pytest.raises(RuntimeError, match="No language model"):
        _ = [chunk async for chunk in llm.astream_with_fallback([])]