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


@pytest.mark.asyncio
async def test_long_itinerary_is_generated_in_two_day_batches(monkeypatch):
    responses = iter([
        AIMessage(content="## Day 1 – A\nA\n## Day 2 – B\nB"),
        AIMessage(content="## Day 3 – C\nC\n## Day 4 – D\nD"),
        AIMessage(content="## Day 5 – E\nE\n## Day 6 – F\nF\n## Logistics & Packing Tips\nPack light."),
    ])
    calls = []

    async def fake_invoke(messages, **kwargs):
        calls.append(messages)
        return next(responses)

    monkeypatch.setattr(planner, "ainvoke_with_fallback", fake_invoke)
    inp = planner.PlanInput(city="HCMC", days=6)
    output = "".join([chunk async for chunk in planner.generate_itinerary(inp)])

    assert planner.itinerary_days(output) == set(range(1, 7))
    assert len(calls) == 3
    assert "Day 5 through Day 6" in calls[-1][-1].content
    assert "Logistics & Packing Tips" in output