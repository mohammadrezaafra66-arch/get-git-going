from __future__ import annotations

import unittest

from link_discovery import color_mismatch, pick_assignment, score_candidate


class LinkDiscoveryTest(unittest.TestCase):
    def test_color_mismatch_is_hard_reject(self):
        self.assertTrue(color_mismatch("یخچال ال‌جی سفید", "یخچال ال‌جی نقره‌ای"))
        score, reasons = score_candidate("یخچال ال‌جی سفید", "یخچال ال‌جی نقره‌ای")
        self.assertEqual(score, 0.0)
        self.assertIn("color_mismatch", reasons)

    def test_pick_assignment_writes_only_above_threshold(self):
        product = {"name": "ماشین لباسشویی پاکشوما 8 کیلویی سفید"}
        result = pick_assignment(
            product,
            [
                {"url": "https://torob.com/p/a/", "name": "یخچال نقره‌ای سامسونگ"},
                {"url": "https://torob.com/p/b/", "name": "ماشین لباسشویی پاکشوما 8 کیلویی سفید"},
            ],
        )
        self.assertIsNotNone(result["chosen"])
        self.assertTrue(result["chosen"]["assigned"])
        self.assertTrue(any("color_mismatch" in (r.get("reasons") or []) for r in result["rejected"]))


if __name__ == "__main__":
    unittest.main()
