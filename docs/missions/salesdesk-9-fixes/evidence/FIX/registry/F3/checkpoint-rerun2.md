# F3 checkpoint — post-attempt-2 rerun (mig 577 + FE p_interaction_id)
updated: 2026-09-22T09:27:08.900Z
state: PASS
item: F3 C9/C5 rerun after APP_GIT_SHA=2102fc48 (577 create_sales_quote_with_items p_interaction_id)
APP_GIT_SHA: 2102fc48
HEAD: 2102fc48
MATCH: yes
C9: PASS
  - draft quote status=draft
  - salesperson_id=ea9b35dd-fd57-4905-9355-50ca8646d4d1 equals deal responsible
  - interaction_id=45e53c14-504f-4aab-a9a6-9304b834065e equals DEAL_ID=45e53c14-504f-4aab-a9a6-9304b834065e
  - UI tab «پیش‌فاکتورها» listed quote (assert passed)
  - KPI/score before==after: kpi_today=0|0→0|0; score_accepted=1779400000|9→1779400000|9; score_total_sales=0.0→0.0
C5: PASS — UI+SQL +1 (sql 0→1, ui 0→1); markers 0 after cleanup
PRODUCT_FIX_NEEDED: no
evidence: f3-rerun2.txt, f3-rerun2-cleanup.txt, f3-rerun2-meta.txt, f3-rerun2-preclean.txt, f3-rerun2-preclean-counts.txt, f3-c9.txt, f3-c5.txt, f3-cleanup.txt
cleanup: {"sales_quotes":0,"sales_interaction_items":0,"sales_interactions":0,"persons":0,"customers":0}
