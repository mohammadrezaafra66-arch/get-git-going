from __future__ import annotations

import unittest

from link_discovery import (
    THRESHOLD,
    color_mismatch,
    evaluate_candidate,
    pick_assignment,
    score_candidate,
)


class LinkDiscoveryTest(unittest.TestCase):
    def test_color_mismatch_is_hard_reject(self):
        self.assertTrue(color_mismatch("یخچال ال‌جی سفید", "یخچال ال‌جی نقره‌ای"))
        score, reasons = score_candidate("یخچال ال‌جی سفید", "یخچال ال‌جی نقره‌ای")
        self.assertEqual(score, 0.0)
        self.assertIn("color_mismatch", reasons)

    def test_our_colour_absent_on_candidate_is_unverified_not_reject(self):
        product = {
            "name": "جاروبرقی پاناسونیک مدل MC-CG713 رنگ مشکی",
            "brand": "پاناسونیک",
            "model": "MC-CG713",
            "color": "مشکی",
            "capacity": None,
        }
        ev = evaluate_candidate(
            product,
            "جارو برقی پاناسونیک مدل mc-cg713 قدرت 2000 وات",
            "https://torob.com/p/x/جارو-برقی-پاناسونیک-مدل-mc-cg713-قدرت-2000-وات/",
        )
        self.assertNotIn("color_mismatch", ev["hard_fails"])
        self.assertIn("colour_unverified", ev["reasons"])

    def test_brand_series_general_max_rejects_general_gold(self):
        product = {
            "name": "جنرال مکس 12000 مدل معمولی سرد وگرم",
            "brand": "جنرال",
            "model": None,
            "color": None,
            "capacity": "12000",
        }
        ev = evaluate_candidate(
            product,
            "جنرال گلد 12000 مدل پلاتینیوم معمولی سرد وگرم",
            "https://torob.com/p/x/جنرال-گلد-12000-مدل-پلاتینیوم-معمولی-سرد-وگرم/",
        )
        self.assertIn("brand_mismatch", ev["hard_fails"])
        self.assertFalse(ev["eligible"])

    def test_model_code_is_hard_when_ours_has_one(self):
        product = {
            "name": "اسپیکر جی بی ال مدل 120B",
            "brand": "جی بی ال",
            "model": "120B",
            "color": None,
            "capacity": None,
        }
        ev = evaluate_candidate(
            product,
            "اسپیکر دی اس مدل ds-kad612",
            "https://torob.com/p/x/ds-kad612/",
        )
        self.assertIn("model_mismatch", ev["hard_fails"])
        self.assertFalse(ev["eligible"])

    def test_capacity_mismatch_is_hard(self):
        product = {
            "name": "کولر گازی جنرال شکار مدل GNR-R24GRAA",
            "brand": "جنرال شکار",
            "model": "GNR-R24GRAA",
            "color": None,
            "capacity": "24000",
        }
        ev = evaluate_candidate(
            product,
            "کولر گازی جنرال شکار 30 هزار gnrr-30graa-i",
            "https://torob.com/p/x/gnrr-30graa-i/",
        )
        self.assertTrue({"model_mismatch", "capacity_mismatch"} & set(ev["hard_fails"]))
        self.assertFalse(ev["eligible"])

    def test_panasonic_partial_token_score_cannot_assign(self):
        self.assertGreater(THRESHOLD, 0.57)
        product = {
            "name": "جاروبرقی پاناسونیک مدل MC-CG713 رنگ مشکی",
            "brand": "پاناسونیک",
            "model": "MC-CG713",
            "color": "مشکی",
            "capacity": None,
        }
        result = pick_assignment(
            product,
            [
                {
                    "url": "https://torob.com/p/x/جارو-برقی-پاناسونیک-مدل-mc-cg713-قدرت-2000-وات/",
                    "name": "جارو برقی پاناسونیک مدل mc-cg713 قدرت 2000 وات",
                }
            ],
        )
        chosen = result["chosen"]
        if chosen:
            self.assertFalse(chosen["assigned"])
        else:
            self.assertTrue(any("below_threshold" in (r.get("reasons") or []) for r in result["rejected"]))

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
