"""
Currency converter — reuses the Orient Exchange rates already scraped by main.py.
Accepts an amount + from/to currencies and returns the converted value.
Rates are expressed as INR-per-unit (e.g. USD -> 96.64).
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ConvertInput(BaseModel):
    amount: float = Field(..., ge=0)
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)


def convert_currency(inp: ConvertInput, rates: dict[str, float]) -> dict:
    """
    `rates` maps CURRENCY -> INR value of 1 unit. INR itself is 1.0.
    Converts amount from `from_currency` to `to_currency` via INR.
    """
    table = {k.upper(): v for k, v in rates.items()}
    table.setdefault("INR", 1.0)

    src = inp.from_currency.upper()
    dst = inp.to_currency.upper()

    if src not in table or dst not in table:
        missing = [c for c in (src, dst) if c not in table]
        raise ValueError(f"No rate available for: {', '.join(missing)}")

    amount_inr = inp.amount * table[src]
    converted = amount_inr / table[dst]

    return {
        "amount": inp.amount,
        "from": src,
        "to": dst,
        "converted": round(converted, 4),
        "amount_inr": round(amount_inr, 2),
        "rate": round(table[src] / table[dst], 6),
        "inverse_rate": round(table[dst] / table[src], 6),
    }
