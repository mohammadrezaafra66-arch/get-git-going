# سیاست Branch و PR

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Active

## 1. اصل اصلی

هیچ تغییری نباید مستقیم روی `main` انجام شود. همه تغییرات باید از طریق branch و Pull Request وارد شوند.

## 2. نام‌گذاری branchها

الگوی پیشنهادی:

```text
phase0/<task-id>-<short-name>
fix/<short-name>
docs/<short-name>
```

نمونه:

```text
phase0/wpc-0-001-worker-dummy
phase0/openapi-automation-contract
docs/source-of-truth-policy
```

## 3. قانون اندازه PR

هر PR باید کوچک و قابل review باشد. اگر PR همزمان UI، database، worker و docs را تغییر می‌دهد، احتمالاً باید شکسته شود.

## 4. PRهای فاز صفر باید شامل این‌ها باشند

1. Task ID.
2. Phase Label.
3. فایل‌های تغییرکرده.
4. تست انجام‌شده.
5. ریسک‌های باقی‌مانده.
6. تأیید اینکه real bot ساخته نشده است.

## 5. موارد ممنوع

- merge مستقیم به main.
- PR بزرگ و مبهم.
- branch طولانی‌مدت بدون rebase/merge.
- تغییر همزمان architecture و implementation بدون ADR.
