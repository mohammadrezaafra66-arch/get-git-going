"""Fails if a failed snapshot insert is swallowed or the run stays completed."""

from __future__ import annotations

import unittest

from snapshots import SnapshotWriteError, finalize_run_status, raise_if_bad_response


class SnapshotWriteTest(unittest.TestCase):
    def test_failed_insert_raises_with_body(self):
        with self.assertRaises(SnapshotWriteError) as ctx:
            raise_if_bad_response(
                400,
                '{"code":"22003","message":"value \\"50000000000\\" is out of range for type integer"}',
                "torob_offer_snapshots",
            )
        self.assertIn("22003", str(ctx.exception))
        self.assertIn("torob_offer_snapshots", str(ctx.exception))

    def test_ok_response_does_not_raise(self):
        raise_if_bad_response(201, "[]", "torob_offer_snapshots")

    def test_insert_failure_marks_run_failed(self):
        self.assertEqual(
            finalize_run_status(insert_failed=True, block_events=[], succeeded=0),
            "failed",
        )
        self.assertEqual(
            finalize_run_status(insert_failed=False, block_events=[], succeeded=1),
            "completed",
        )


if __name__ == "__main__":
    unittest.main()
