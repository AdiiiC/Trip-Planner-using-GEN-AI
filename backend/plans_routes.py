"""Authenticated CRUD for a user's saved budget plans (cross-device sync)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import models
from auth_deps import get_current_user
from auth_schemas import PlanInput, PlanOut
from db import get_db

router = APIRouter(prefix="/api/plans", tags=["plans"])

_MAX_PLANS = 100


def _to_out(p: models.BudgetPlan) -> PlanOut:
    return PlanOut(
        id=p.id,
        name=p.name,
        payload=json.loads(p.payload),
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


@router.get("", response_model=list[PlanOut])
def list_plans(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(models.BudgetPlan)
        .where(models.BudgetPlan.user_id == user.id)
        .order_by(models.BudgetPlan.updated_at.desc())
    ).all()
    return [_to_out(p) for p in rows]


@router.post("", response_model=PlanOut, status_code=201)
def create_plan(body: PlanInput, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = db.scalar(
        select(func.count(models.BudgetPlan.id)).where(models.BudgetPlan.user_id == user.id)
    ) or 0
    if total >= _MAX_PLANS:
        raise HTTPException(status_code=409, detail=f"Plan limit reached ({_MAX_PLANS})")
    plan = models.BudgetPlan(user_id=user.id, name=body.name, payload=json.dumps(body.payload))
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _to_out(plan)


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, body: PlanInput, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.get(models.BudgetPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan.name = body.name
    plan.payload = json.dumps(body.payload)
    db.commit()
    db.refresh(plan)
    return _to_out(plan)


@router.delete("/{plan_id}", status_code=204)
def delete_plan(plan_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.get(models.BudgetPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(plan)
    db.commit()
