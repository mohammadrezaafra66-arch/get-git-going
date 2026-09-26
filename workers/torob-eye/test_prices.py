"""Price unit, parse glue, and outlier exclusion — fail first, then pass."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ported"))

from prices import (  # noqa: E402
    PLACEHOLDER_PRICES,
    annotate_snapshots,
    classify_price,
    median_int,
    observatory_stats,
)
from scraper import _price_from_text  # noqa: E402
from utils import to_int_price  # noqa: E402


class ParseUnitTest(unittest.TestCase):
    def test_visible_toman_matches_json_price_not_rial(self):
        # Live LG PDP 2026-09-26: JSON price == rendered "N تومان" (not ×10 rial).
        triples = [
            ("لوازم خانگی تاج شاپینگ", "۳۵۰٫۰۰۰٫۰۰۰ تومان", 350_000_000),
            ("کولر گازی بانه", "۳۵۱٫۰۰۰٫۰۰۰ تومان", 351_000_000),
            ("جی اس ام", "۵۴۹٫۲۰۰٫۰۰۰ تومان", 549_200_000),
        ]
        for shop, visible, json_price in triples:
            with self.subTest(shop=shop):
                parsed = _price_from_text(f"خرید از {shop}\n{visible}")
                self.assertEqual(parsed, json_price)
                self.assertEqual(parsed, to_int_price(visible))

    def test_capacity_line_does_not_glue_onto_toman_price(self):
        card = "یخچال ساید ظرفیت ۳۰ فوت\n۳۵۰٫۰۰۰٫۰۰۰ تومان"
        self.assertEqual(_price_from_text(card), 350_000_000)

    def test_to_int_price_does_not_concatenate_extra_digits(self):
        dirty = "۳۵۰٫۰۰۰٫۰۰۰ تومان امتیاز 4.8 از 50 رای"
        self.assertEqual(to_int_price(dirty), 350_000_000)
        self.assertNotEqual(to_int_price(dirty), 50_000_000_000)


class OutlierTest(unittest.TestCase):
    def test_non_positive_and_placeholder_are_excluded(self):
        excluded, reason = classify_price(0, 100_000)
        self.assertTrue(excluded)
        self.assertEqual(reason, "non_positive")
        excluded, reason = classify_price(-12, 100_000)
        self.assertTrue(excluded)
        self.assertEqual(reason, "non_positive")
        self.assertIn(50_000_000_000, PLACEHOLDER_PRICES)
        excluded, reason = classify_price(50_000_000_000, 350_000_000)
        self.assertTrue(excluded)
        self.assertEqual(reason, "placeholder")

    def test_median_band_excludes_0_3x_and_3x(self):
        median = 100_000
        lo, lo_reason = classify_price(29_999, median)
        hi, hi_reason = classify_price(300_001, median)
        mid, mid_reason = classify_price(100_000, median)
        self.assertTrue(lo)
        self.assertEqual(lo_reason, "below_median_band")
        self.assertTrue(hi)
        self.assertEqual(hi_reason, "above_median_band")
        self.assertFalse(mid)
        self.assertIsNone(mid_reason)

    def test_annotate_uses_product_median_and_keeps_row(self):
        rows = [
            {"seller_name": "a", "price_toman": 100_000},
            {"seller_name": "b", "price_toman": 110_000},
            {"seller_name": "c", "price_toman": 90_000},
            {"seller_name": "outlier", "price_toman": 50_000_000_000},
            {"seller_name": "zero", "price_toman": 0},
        ]
        out = annotate_snapshots(rows)
        by_name = {r["seller_name"]: r for r in out}
        self.assertTrue(by_name["outlier"]["excluded"])
        self.assertEqual(by_name["outlier"]["exclude_reason"], "placeholder")
        self.assertTrue(by_name["zero"]["excluded"])
        self.assertFalse(by_name["a"]["excluded"])
        self.assertEqual(by_name["outlier"]["price_toman"], 50_000_000_000)

    def test_observatory_stats_ignore_excluded(self):
        rows = annotate_snapshots(
            [
                {"price_toman": 100_000},
                {"price_toman": 120_000},
                {"price_toman": 50_000_000_000},
            ]
        )
        stats = observatory_stats(rows)
        self.assertEqual(stats["torob_min_price_toman"], 100_000)
        self.assertEqual(stats["torob_max_price_toman"], 120_000)
        self.assertEqual(stats["torob_avg_price_toman"], 110_000)
        self.assertEqual(stats["torob_seller_count"], 2)
        self.assertEqual(median_int([100_000, 120_000, 50_000_000_000]), 120_000)


if __name__ == "__main__":
    unittest.main()
