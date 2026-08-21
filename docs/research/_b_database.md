"""One-shot backfill of warm_daily_metric from inbox_messages.

Default is --dry-run. Refuses the live whatsapp_sender database unless --force-live is passed.

  python -m app.scripts.backfill_warm_daily_metric --dry-run
  python -m app.scripts.backfill_warm_daily_metric --apply
  python -m app.scripts.backfill_warm_daily_metric --apply --force-live  # ⚠️ ONLY ON LIVE
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from sqlalchemy import create_engine, text

from app.services.migration_db_guard import ENV_A_PROTECTED_DB_NAMES, database_name_from_url
from app.services.warming import clock

CUTOFF_DATE = date(2026, 8, 19)
LOOKBACK_DAYS = 7
MIN_INBOUND = 5


def _sync_url() -> str:
    url = os.environ.get("SYNC_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    return url.replace("postgresql+asyncpg://", "postgresql://")


def assert_safe_database(url: str, force_live: bool = False) -> str:
    name = database_name_from_url(url)
    if not name:
        raise SystemExit("DATABASE_URL / SYNC_DATABASE_URL is empty")
    
    # اگر فلگ force-live داده شده باشد، فقط هشدار می‌دهیم و ادامه می‌دهیم
    if force_live:
        print("⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️")
        print("⚠️  شما در حال اجرای اسکریپت روی دیتابیس زنده هستید!       ⚠️")
        print("⚠️  این کار داده‌های warm_daily_metric را تغییر می‌دهد.    ⚠️")
        print("⚠️  مطمئن هستید که می‌خواهید ادامه دهید؟                   ⚠️")
        print("⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️")
        return name
    
    # رفتار عادی: رد کردن دیتابیس زنده
    if name in ENV_A_PROTECTED_DB_NAMES:
        raise SystemExit(
            f"REFUSING live database {name!r}. Use warming_test. "
            "To force live, pass --force-live (with caution)."
        )
    if "test" not in name and "warming" not in name:
        raise SystemExit(f"REFUSING database {name!r}; expected warming_test")
    return name


def target_dates(*, today: date | None = None) -> list[date]:
    """Seven local dates ending the day before min(today, CUTOFF_DATE)."""
    end_exclusive = min(today or clock.today_local(), CUTOFF_DATE)
    start = end_exclusive - timedelta(days=LOOKBACK_DAYS)
    return [start + timedelta(days=i) for i in range(LOOKBACK_DAYS)]


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min)
    return start, start + timedelta(days=1)


def plan_backfill(conn, *, today: date | None = None) -> list[dict]:
    dates = target_dates(today=today)
    numbers = conn.execute(
        text(
            """
            SELECT id, phone_e164, display_label, green_instance_id, stage
            FROM warm_number
            WHERE stage <> 'R1_RETIRED'
            ORDER BY id
            """
        )
    ).mappings().all()
    planned: list[dict] = []
    for wn in numbers:
        iid = (wn["green_instance_id"] or "").strip()
        per_phone = []
        for d in dates:
            start, end = _day_bounds(d)
            if not iid:
                inbound, unique = 0, 0
            else:
                inbound = int(
                    conn.execute(
                        text(
                            """
                            SELECT COUNT(*) FROM inbox_messages
                            WHERE instance_id = :iid
                              AND COALESCE(is_group, false) = false
                              AND received_at >= :start
                              AND received_at < :end
                            """
                        ),
                        {"iid": iid, "start": start, "end": end},
                    ).scalar()
                    or 0
                )
                unique = int(
                    conn.execute(
                        text(
                            """
                            SELECT COUNT(DISTINCT sender_phone) FROM inbox_messages
                            WHERE instance_id = :iid
                              AND COALESCE(is_group, false) = false
                              AND received_at >= :start
                              AND received_at < :end
                            """
                        ),
                        {"iid": iid, "start": start, "end": end},
                    ).scalar()
                    or 0
                )
            if inbound < MIN_INBOUND:
                continue
            per_phone.append(
                {
                    "warm_number_id": wn["id"],
                    "phone_e164": wn["phone_e164"],
                    "date_local": d,
                    "manual_inbound": inbound,
                    "unique_senders": unique,
                    "instance_id": iid,
                }
            )
        planned.extend(per_phone)
    return planned


UPSERT_SQL = text(
    """
    INSERT INTO warm_daily_metric (
        warm_number_id, date_local,
        manual_inbound, unique_senders,
        data_quality, computed_at_utc, source_snapshot
    ) VALUES (
        :warm_number_id, :date_local,
        :manual_inbound, :unique_senders,
        'OK', :computed_at_utc, CAST(:source_snapshot AS jsonb)
    )
    ON CONFLICT (warm_number_id, date_local) DO UPDATE SET
        manual_inbound = EXCLUDED.manual_inbound,
        unique_senders = EXCLUDED.unique_senders,
        data_quality = 'OK',
        computed_at_utc = EXCLUDED.computed_at_utc,
        source_snapshot = EXCLUDED.source_snapshot
    """
)


def apply_backfill(conn, rows: list[dict], *, now: datetime | None = None) -> int:
    n = 0
    computed = (now or clock.now_utc().replace(tzinfo=None))
    for row in rows:
        snap = {
            "backfill": True,
            "source": "inbox_messages",
            "instance_id": row["instance_id"],
            "manual_inbound": row["manual_inbound"],
            "unique_senders": row["unique_senders"],
        }
        conn.execute(
            UPSERT_SQL,
            {
                "warm_number_id": row["warm_number_id"],
                "date_local": row["date_local"],
                "manual_inbound": row["manual_inbound"],
                "unique_senders": row["unique_senders"],
                "computed_at_utc": computed,
                "source_snapshot": json.dumps(snap),
            },
        )
        n += 1
    return n


def print_summary(rows: list[dict], *, mode: str, database: str) -> None:
    print(f"mode={mode} database={database}")
    print(f"cutoff_exclusive={CUTOFF_DATE.isoformat()} days={LOOKBACK_DAYS} min_inbound={MIN_INBOUND}")
    dates = target_dates()
    print(f"dates={dates[0].isoformat()}..{dates[-1].isoformat()}" if dates else "dates=")
    by_phone: dict[str, int] = defaultdict(int)
    for row in rows:
        by_phone[str(row["phone_e164"])] += 1
        print(
            f"  would_upsert phone={row['phone_e164']} date={row['date_local']} "
            f"inbound={row['manual_inbound']} unique={row['unique_senders']}"
        )
    print(f"total_rows={len(rows)}")
    if not by_phone:
        print("per_phone=(none)")
        return
    print("per_phone:")
    for phone, count in sorted(by_phone.items()):
        print(f"  {phone}: {count}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="preview only (default)")
    g.add_argument("--apply", action="store_true", help="write warm_daily_metric")
    p.add_argument(
        "--force-live",
        action="store_true",
        help="⚠️  ALLOW RUN ON LIVE whatsapp_sender (use with extreme caution!)"
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    apply = bool(args.apply)
    force_live = bool(args.force_live)
    url = _sync_url()
    
    # اگر force-live نداد، دیتابیس را چک می‌کند و رد می‌کند
    db = assert_safe_database(url, force_live=force_live)
    
    eng = create_engine(url)
    try:
        with eng.connect() as conn:
            rows = plan_backfill(conn)
            print_summary(rows, mode="apply" if apply else "dry-run", database=db)
            if not apply:
                conn.rollback()
                return 0
            n = apply_backfill(conn, rows)
            conn.commit()
            print(f"applied={n}")
            return 0
    finally:
        eng.dispose()


def seed_inbox(conn, instance_id: str, day: date, senders: list[str]) -> None:
    """Test helper: one inbox row per sender at noon local on `day`."""
    received = datetime.combine(day, time(12, 0))
    for phone in senders:
        conn.execute(
            text(
                """
                INSERT INTO inbox_messages (
                    id, instance_id, sender_phone, message_type, is_group,
                    is_reply, auto_replied, is_read, received_at
                ) VALUES (
                    :id, :iid, :phone, 'text', false,
                    false, false, false, :received
                )
                """
            ),
            {
                "id": uuid4(),
                "iid": instance_id,
                "phone": phone,
                "received": received,
            },
        )


if __name__ == "__main__":
    sys.exit(main())