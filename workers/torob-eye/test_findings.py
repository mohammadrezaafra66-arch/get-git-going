from __future__ import annotations

import unittest

from findings import cheapest_non_own, classify


class FindingsTest(unittest.TestCase):
    def test_own_shop_snapshot_is_excluded(self):
        cheap = cheapest_non_own(
            [
                {"seller_name": "افراکالا", "price_toman": 1000, "is_own_shop": True},
                {"seller_name": "رقیب", "price_toman": 1800, "is_own_shop": False},
            ]
        )
        self.assertIsNotNone(cheap)
        self.assertEqual(cheap["seller_name"], "رقیب")

    def test_all_own_returns_none(self):
        self.assertIsNone(
            cheapest_non_own(
                [{"seller_name": "ما", "price_toman": 1, "is_own_shop": True}]
            )
        )

    def test_classify_large_gap_is_manual_review(self):
        self.assertEqual(classify(100, 60, False, False), "manual_review")
        self.assertEqual(classify(100, 90, True, False), "suspected_bait")


if __name__ == "__main__":
    unittest.main()
