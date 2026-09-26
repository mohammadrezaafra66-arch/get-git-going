"""Real Torob report submission. SIMULATE skips only the final click."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


PRE_SUBMIT_STEPS = [
    "session_applied",
    "navigated",
    "own_shop_guard",
    "kill_switch",
    "hourly_cap",
    "repeat_window",
    "template_filled",
]


@dataclass(frozen=True)
class ReportPlan:
    pre_submit: list[str]
    click_final: bool
    skipped: list[str]


def plan_report_actions(*, simulate: bool) -> ReportPlan:
    return ReportPlan(
        pre_submit=list(PRE_SUBMIT_STEPS),
        click_final=not simulate,
        skipped=["final_submit"] if simulate else [],
    )


def evaluate_guards(
    *,
    auto_report_enabled: bool,
    kill_switch: bool,
    own_shop_count: int,
    reports_last_hour: int,
    hourly_cap: int,
    recent_same_report: bool,
) -> str | None:
    if not auto_report_enabled:
        return "auto_report_disabled"
    if own_shop_count <= 0:
        return "own_shops_empty"
    if kill_switch:
        return "kill_switch"
    if reports_last_hour >= hourly_cap:
        return "hourly_cap"
    if recent_same_report:
        return "repeat_window"
    return None


def apply_template(body: str, values: dict[str, Any]) -> str:
    out = body or ""
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", "" if value is None else str(value))
    return out


async def apply_session_cookies(context, session_plain: str | None) -> str:
    if not session_plain:
        return "no_session"
    try:
        import json

        blob = json.loads(session_plain)
        cookies = blob if isinstance(blob, list) else blob.get("cookies") or []
        if cookies:
            await context.add_cookies(cookies)
            return "session_applied"
    except Exception:
        return "session_parse_failed"
    return "session_empty"


async def run_report_flow(
    page,
    *,
    report_url: str,
    report_text: str,
    simulate: bool,
) -> dict[str, Any]:
    plan = plan_report_actions(simulate=simulate)
    steps = list(plan.pre_submit)
    await page.goto(report_url, wait_until="domcontentloaded")
    locator = page.locator("textarea[name=report_text], #report-text, textarea").first
    if await locator.count():
        await locator.fill(report_text)
    submitted = False
    if plan.click_final:
        target = page.locator("#final-submit, button[type=submit]").first
        if await target.count():
            await target.click()
            submitted = True
            steps.append("final_submitted")
    return {
        "steps": steps,
        "skipped": plan.skipped,
        "submitted": submitted,
        "simulate": simulate,
    }
