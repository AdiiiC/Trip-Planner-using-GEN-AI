"""Authenticated CRUD for a user's saved budget plans (cross-device sync).

Plans keep their last computed result so the list can be ranked by cost without
recalculating, and every edit pushes the previous state onto a capped history so
the UI can show what a change cost.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import models
from auth_deps import get_current_user
from auth_schemas import PlanInput, PlanOut, PlanVersionOut
from db import get_db

router = APIRouter(prefix="/api/plans", tags=["plans"])

_MAX_PLANS = 100
# Deep history has no audience here; the diff view only ever compares against
# recent states, and unbounded snapshots of a big JSON blob add up.
_MAX_VERSIONS = 20


def _loads(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def _to_out(p: models.BudgetPlan) -> PlanOut:
    return PlanOut(
        id=p.id,
        name=p.name,
        payload=json.loads(p.payload),
        result=_loads(p.result),
        total_inr=p.total_inr,
        nights=p.nights,
        version_count=len(p.versions),
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


def _owned(plan_id: int, user: models.User, db: Session) -> models.BudgetPlan:
    """Load a plan the caller owns, or 404 — never reveal that someone else's exists."""
    plan = db.get(models.BudgetPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def _snapshot(plan: models.BudgetPlan, db: Session) -> None:
    """Record the plan as it is now, then trim the oldest snapshots."""
    db.add(models.PlanVersion(
        plan_id=plan.id, payload=plan.payload, result=plan.result, total_inr=plan.total_inr
    ))
    db.flush()
    stale = db.scalars(
        select(models.PlanVersion)
        .where(models.PlanVersion.plan_id == plan.id)
        .order_by(models.PlanVersion.created_at.desc(), models.PlanVersion.id.desc())
        .offset(_MAX_VERSIONS)
    ).all()
    for version in stale:
        db.delete(version)


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
    plan = models.BudgetPlan(
        user_id=user.id,
        name=body.name,
        payload=json.dumps(body.payload),
        result=json.dumps(body.result) if body.result is not None else None,
        total_inr=body.total_inr,
        nights=body.nights,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _to_out(plan)


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, body: PlanInput, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _owned(plan_id, user, db)
    payload = json.dumps(body.payload)
    if payload != plan.payload:
        # Only real edits earn a snapshot; re-saving an unchanged plan shouldn't
        # push the useful history out of the window.
        _snapshot(plan, db)
    plan.name = body.name
    plan.payload = payload
    plan.result = json.dumps(body.result) if body.result is not None else None
    plan.total_inr = body.total_inr
    plan.nights = body.nights
    db.commit()
    db.refresh(plan)
    return _to_out(plan)


@router.get("/{plan_id}/versions", response_model=list[PlanVersionOut])
def list_versions(plan_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _owned(plan_id, user, db)
    return [
        PlanVersionOut(
            id=v.id,
            payload=json.loads(v.payload),
            total_inr=v.total_inr,
            created_at=v.created_at.isoformat(),
        )
        for v in plan.versions
    ]


@router.post("/{plan_id}/restore/{version_id}", response_model=PlanOut)
def restore_version(
    plan_id: int,
    version_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Roll a plan back to a snapshot. The pre-restore state is itself snapshotted."""
    plan = _owned(plan_id, user, db)
    version = db.get(models.PlanVersion, version_id)
    if version is None or version.plan_id != plan.id:
        raise HTTPException(status_code=404, detail="Version not found")
    _snapshot(plan, db)
    plan.payload = version.payload
    plan.result = version.result
    plan.total_inr = version.total_inr
    db.commit()
    db.refresh(plan)
    return _to_out(plan)


@router.delete("/{plan_id}", status_code=204)
def delete_plan(plan_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _owned(plan_id, user, db)
    db.delete(plan)
    db.commit()
