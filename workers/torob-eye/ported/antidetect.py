"""رفتار انسانی و کاهش احتمال شناسایی شدن ربات.

سه لایه دارد:
  ۱. تأخیرهای تصادفی (نه ثابت — الگوی ثابت خودش امضای ربات است)
  ۲. حرکت ماوس و اسکرول شبیه انسان
  ۳. چرخش User-Agent و پنهان کردن نشانه‌های خودکارسازی
"""

import asyncio
import random

import config

# نشانه‌هایی که در متن صفحه یعنی بلاک/کپچا خورده‌ایم
BLOCK_SIGNS = [
    "captcha", "کپچا", "ربات نیستم", "دسترسی شما مسدود",
    "too many requests", "access denied", "غیرمجاز",
]

# اسکریپتی که قبل از هر صفحه تزریق می‌شود تا navigator.webdriver دیده نشود
STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'languages', {get: () => ['fa-IR', 'fa', 'en-US']});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
window.chrome = window.chrome || {runtime: {}};
"""


def pick_user_agent() -> str:
    """اگر کاربر UA ثابت تعریف کرده باشد همان، وگرنه یکی تصادفی."""
    return config.FIXED_USER_AGENT or random.choice(config.USER_AGENTS)


async def random_delay(min_seconds: float = 1.0, max_seconds: float = 3.0) -> None:
    await asyncio.sleep(random.uniform(min_seconds, max_seconds))


async def human_mouse_move(page, moves: int = 3) -> None:
    """چند حرکت ماوس با مکث‌های نامنظم — نه یک پرش ناگهانی."""
    if not config.HUMAN_BEHAVIOR:
        return
    try:
        for _ in range(moves):
            await page.mouse.move(random.randint(120, 1100), random.randint(120, 700),
                                  steps=random.randint(5, 15))
            await asyncio.sleep(random.uniform(0.1, 0.5))
    except Exception:
        pass


async def human_scroll(page, passes: int = 4) -> None:
    """اسکرول پلکانی با مقادیر و مکث‌های متفاوت، گاهی کمی به عقب."""
    if not config.HUMAN_BEHAVIOR:
        return
    try:
        for _ in range(passes):
            await page.mouse.wheel(0, random.randint(180, 620))
            await asyncio.sleep(random.uniform(0.3, 1.1))
        if random.random() < 0.4:                      # گاهی آدم برمی‌گردد بالا
            await page.mouse.wheel(0, -random.randint(90, 260))
            await asyncio.sleep(random.uniform(0.2, 0.6))
    except Exception:
        pass


async def warm_up(page) -> None:
    """کارهایی که یک بازدیدکننده‌ی واقعی بعد از باز شدن صفحه انجام می‌دهد."""
    await random_delay(1.0, 2.5)
    await human_mouse_move(page)
    await human_scroll(page)


async def looks_blocked(page) -> bool:
    """آیا صفحه نشانه‌ی بلاک شدن یا کپچا دارد؟"""
    try:
        text = (await page.content())[:20000].lower()
    except Exception:
        return False
    return any(sign in text for sign in BLOCK_SIGNS)


def proxy_settings() -> dict | None:
    """تنظیمات پروکسی به شکلی که Playwright می‌خواهد؛ None یعنی بدون پروکسی."""
    if not config.PROXY_SERVER:
        return None
    proxy = {"server": config.PROXY_SERVER}
    if config.PROXY_USERNAME:
        proxy["username"] = config.PROXY_USERNAME
        proxy["password"] = config.PROXY_PASSWORD
    return proxy


async def backoff_sleep(attempt: int, base: float = 5.0, cap: float = 300.0) -> float:
    """عقب‌نشینی نمایی با jitter — بعد از هر شکست بیشتر صبر می‌کنیم."""
    delay = min(cap, base * (2 ** max(0, attempt - 1)))
    delay *= random.uniform(0.7, 1.3)
    await asyncio.sleep(delay)
    return delay
