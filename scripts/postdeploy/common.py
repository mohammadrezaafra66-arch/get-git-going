import os, re

SP = os.path.dirname(os.path.abspath(__file__))
ORIGIN = "http://192.168.170.10:3000"
SENTINEL = "00000000-0000-0000-0000-000000000000"

ids = {}
for line in open(os.path.join(SP, "ids.txt"), encoding="utf-8"):
    k, _, v = line.strip().partition("=")
    ids[k] = v or SENTINEL

PARAM = {
    "$courseId": ids["courseId"], "$lessonId": ids["lessonId"], "$receiptId": ids["receiptId"],
    "$tableId": ids["tableId"], "$feedbackId": ids["feedbackId"], "$documentId": ids["documentId"],
    "$personId": ids["personId"], "$listId": ids["listId"], "$id": ids["productId"],
    "$customerId": ids["customerId"], "$quoteId": ids["quoteId"], "$supplierId": ids["supplierId"],
    "$userId": ids["userId"],
}

# Routes whose GET has a side effect on production -> never requested.
NOT_EXERCISED = {
    "/api/public/bot/products": "GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth",
    "/api/public/bot/products/$productId": "GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth",
    "/api/public/bot/dynamic-tables/by-slug/$slug": "GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth",
    "/api/public/bot/dynamic-tables/$tableId/rows": "GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth",
    "/mcp": "mcp-js metrics enabled + LOVABLE_API_KEY set: a GET may emit an outbound telemetry POST",
    "/.mcp/list-tools": "mcp-js metrics enabled + LOVABLE_API_KEY set: a GET may emit an outbound telemetry POST",
    "/.mcp/invoke-tool/$tool": "mcp-js metrics enabled + LOVABLE_API_KEY set: a GET may emit an outbound telemetry POST",
}

def concrete(route):
    parts = []
    for seg in route.split("/"):
        parts.append(PARAM.get(seg, seg))
    return "/".join(parts)

def load(name):
    return [l.strip() for l in open(os.path.join(SP, name), encoding="utf-8") if l.strip()]

ERROR_PATTERNS = [
    "Something went wrong", "something went wrong", "مشکلی هنگام بارگذاری رخ داد", "خطا در بارگذاری برنامه",
    "خطا در بارگذاری سیستم احراز", "خطا در سیستم احراز هویت", "صفحه یافت نشد", "TypeError", "ReferenceError",
    "Cannot read properties", "is not a function", "PGRST", "42501", "42883", "permission denied",
    "does not exist", "Unexpected Application Error", "Internal Server Error", "Error:",
]
LATIN = re.compile(r"[0-9]")
PERSIAN = re.compile(r"[۰-۹]")
ARABIC = re.compile(r"[٠-٩]")
