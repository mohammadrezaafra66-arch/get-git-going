"""M1.4 — move the root-level markdown into docs/, then repair every reference to it.

The files are documentation of this project, so the phase's own definition of "stray"
excludes them from deletion; they are relocated instead. Cross-references live only in
markdown prose, so a literal filename replacement across the tree is sufficient and safe.
"""
import os, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"
os.chdir(ROOT)

MOVES = {
    # research briefs and diagnoses
    "docs/research": [
        "AfraKala-ai-research-codex.md",
        "AfraKala-capability-inventory-research.md",
        "AfraKala-data-gamification-rag.md",
        "AfraKala-infra-map-research.md",
        "AfraKala-prod-banner-research.md",
        "AfraKala-research-brief-140-193.md",
        "AfraKala-research-pass-2.md",
        "AfraKala-research-pass-3.md",
        "AfraKala-settlement-encoding-research.md",
    ],
    "docs/audits": ["AfraKala-audit-211-218-codex.md"],
    # execution prompts, plans and phase completion reports
    "docs/execution": [
        "AfraKala-continuation-after-audit.md",
        "AfraKala-deploy-hardening-fix.md",
        "AfraKala-execution-integrated.md",
        "AfraKala-execution-plan-140-193.md",
        "AfraKala-execution-round2.md",
        "AfraKala-execution-round3.md",
        "AfraKala-execution-round4.md",
        "AfraKala-final-plan.md",
        "AfraKala-navigation-codex-FINAL.md",
        "AfraKala-phase2-payment-chain.md",
        "AfraKala-settlement-encoding-fix.md",
        "AfraKala-verification-prompt-140-193.md",
        "AfraKala-weight-fix-continuation.md",
        "EXECUTION_P1_D8.md",
        "PHASE_6_COMPLETE.md",
        "PHASE_7_COMPLETE.md",
        "PHASE_8_COMPLETE.md",
    ],
    "docs/asan": ["ASAN_BRIDGE.md"],
}

RENAMES = {"docs/research/New Text Document.txt": "docs/research/exec-prompt-194-209.md"}


def run(*args):
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(f"{' '.join(args)}\n{r.stdout}{r.stderr}")
    return r.stdout


tracked = set(run("git", "ls-files").split("\n"))
mapping = {}
for dest, files in MOVES.items():
    os.makedirs(dest, exist_ok=True)
    for f in files:
        assert os.path.exists(f), f
        target = f"{dest}/{f}"
        if f in tracked:
            run("git", "mv", f, target)
        else:
            os.replace(f, target)
        mapping[f] = target
        print(f"moved {f} -> {target}")

for src, dst in RENAMES.items():
    assert os.path.exists(src), src
    run("git", "mv", src, dst)
    mapping[os.path.basename(src)] = dst
    print(f"renamed {src} -> {dst}")

# repair references
changed = 0
for dirpath, dirnames, filenames in os.walk("."):
    dirnames[:] = [d for d in dirnames if d not in
                   (".git", "node_modules", ".output", "test-results", ".tanstack", ".wrangler")]
    for fn in filenames:
        if not fn.endswith((".md", ".txt", ".ts", ".tsx", ".sql", ".ps1", ".sh", ".json")):
            continue
        p = os.path.join(dirpath, fn)
        try:
            txt = open(p, encoding="utf-8").read()
        except Exception:
            continue
        new = txt
        for old, target in mapping.items():
            if old not in new:
                continue
            # `target` ends with `old`, so protect any already-correct path first
            new = new.replace(target, "\x00").replace(old, target).replace("\x00", target)
        if new != txt:
            open(p, "w", encoding="utf-8", newline="").write(new)
            changed += 1
            print(f"  refs updated: {p}")
print(f"files with references updated: {changed}")
