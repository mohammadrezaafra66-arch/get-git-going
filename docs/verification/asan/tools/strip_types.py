"""Remove the four dropped functions and two dropped tables from the generated
Supabase types. Each entry is a `name: { ... }` block indented six spaces; the block
ends at the first line that is exactly six spaces + '}'."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
P = r"D:\AfraKalaTest\app\src\integrations\supabase\types.ts"
lines = open(P, encoding="utf-8").read().split("\n")

TARGETS = [
    "customer_capital_allocations",
    "salesperson_capital_allocations",
    "compute_customer_capital_allocations",
    "compute_salesperson_capital_allocations",
    "save_customer_capital_allocations",
    "save_salesperson_capital_allocations",
]

out, i, removed = [], 0, []
while i < len(lines):
    line = lines[i]
    hit = next((t for t in TARGETS if line == f"      {t}: {{"), None)
    if hit is None:
        out.append(line)
        i += 1
        continue
    j = i + 1
    while j < len(lines) and lines[j] != "      }":
        j += 1
    assert j < len(lines), hit
    removed.append((hit, j - i + 1))
    i = j + 1

assert len(removed) == len(TARGETS), removed
open(P, "w", encoding="utf-8", newline="\n").write("\n".join(out))
for name, n in removed:
    print(f"removed {name}: {n} lines")
