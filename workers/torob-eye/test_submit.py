"""Seen failing before submit.py existed. SIMULATE must skip only the last click."""

from __future__ import annotations

import unittest

from submit import evaluate_guards, plan_report_actions


class SubmitPlanTest(unittest.TestCase):
    def test_simulate_runs_every_step_except_final_click(self):
        plan = plan_report_actions(simulate=True)
        self.assertEqual(
            plan.pre_submit,
            [
                "session_applied",
                "navigated",
                "own_shop_guard",
                "kill_switch",
                "hourly_cap",
                "repeat_window",
                "template_filled",
            ],
        )
        self.assertFalse(plan.click_final)
        self.assertEqual(plan.skipped, ["final_submit"])

    def test_live_plan_clicks_final(self):
        plan = plan_report_actions(simulate=False)
        self.assertTrue(plan.click_final)
        self.assertEqual(plan.skipped, [])

    def test_guards_block_empty_own_shops_and_kill_switch(self):
        blocked = evaluate_guards(
            auto_report_enabled=True,
            kill_switch=False,
            own_shop_count=0,
            reports_last_hour=0,
            hourly_cap=10,
            recent_same_report=False,
        )
        self.assertEqual(blocked, "own_shops_empty")

        blocked = evaluate_guards(
            auto_report_enabled=True,
            kill_switch=True,
            own_shop_count=1,
            reports_last_hour=0,
            hourly_cap=10,
            recent_same_report=False,
        )
        self.assertEqual(blocked, "kill_switch")

        blocked = evaluate_guards(
            auto_report_enabled=True,
            kill_switch=False,
            own_shop_count=1,
            reports_last_hour=10,
            hourly_cap=10,
            recent_same_report=False,
        )
        self.assertEqual(blocked, "hourly_cap")

        blocked = evaluate_guards(
            auto_report_enabled=True,
            kill_switch=False,
            own_shop_count=1,
            reports_last_hour=1,
            hourly_cap=10,
            recent_same_report=True,
        )
        self.assertEqual(blocked, "repeat_window")

        self.assertIsNone(
            evaluate_guards(
                auto_report_enabled=True,
                kill_switch=False,
                own_shop_count=1,
                reports_last_hour=1,
                hourly_cap=10,
                recent_same_report=False,
            )
        )


if __name__ == "__main__":
    unittest.main()
