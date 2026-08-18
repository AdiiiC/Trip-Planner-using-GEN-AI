from langchain_core.messages import AIMessage
import pytest

from agents import planner


def test_itinerary_days_accepts_unicode_spaces():
    markdown = "## Day\u202f1 – Markets\nA\n## Day\u00a02 – Museums\nB"
    assert planner.itinerary_days(markdown) == {1, 2}


@pytest.mark.asyncio
async def test_incomplete_itinerary_is_regenerated(monkeypatch):
    responses = iter([
        AIMessage(content="## Day 1 – Arrival\nOnly one day"),
        AIMessage(content="## Day 1 – Arrival\nA\n## Day 2 – Culture\nB"),
    ])
    calls = []

    async def fake_invoke(messages, **kwargs):
        calls.append(messages)
        return next(responses)

    monkeypatch.setattr(planner, "ainvoke_with_fallback", fake_invoke)
    inp = planner.PlanInput(city="HCMC", days=2)
    output = "".join([chunk async for chunk in planner.generate_itinerary(inp)])

    assert planner.itinerary_days(output) == {1, 2}
    assert len(calls) == 2
    assert "omitted day sections [2]" in calls[1][-1].content