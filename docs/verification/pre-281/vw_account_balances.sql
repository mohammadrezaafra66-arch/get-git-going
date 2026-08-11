 WITH inflow AS (
         SELECT pr.destination_bank_account_id AS account_id,
            COALESCE(sum(pr.amount), 0::numeric) AS total_in,
            count(*) AS in_count
           FROM payment_receipts pr
          WHERE pr.destination_bank_account_id IS NOT NULL AND pr.status = 'approved'::text
          GROUP BY pr.destination_bank_account_id
        ), outflow AS (
         SELECT pv.source_bank_account_id AS account_id,
            COALESCE(sum(pv.amount), 0::numeric) AS total_out,
            count(*) AS out_count
           FROM payment_vouchers pv
          WHERE pv.status = 'approved'::text
          GROUP BY pv.source_bank_account_id
        )
 SELECT ba.id AS account_id,
    ba.title,
    ba.bank_name,
    ba.account_type,
    ba.currency,
    ba.is_active,
    ba.opening_balance,
    COALESCE(i.total_in, 0::numeric) AS total_in,
    COALESCE(o.total_out, 0::numeric) AS total_out,
    ba.opening_balance + COALESCE(i.total_in, 0::numeric) - COALESCE(o.total_out, 0::numeric) AS current_balance,
    COALESCE(i.in_count, 0::bigint) AS in_count,
    COALESCE(o.out_count, 0::bigint) AS out_count
   FROM bank_accounts ba
     LEFT JOIN inflow i ON i.account_id = ba.id
     LEFT JOIN outflow o ON o.account_id = ba.id;
