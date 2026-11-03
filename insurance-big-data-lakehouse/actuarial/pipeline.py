"""One-shot actuarial pipeline: frequency → severity → pricing → adequacy → reserving.

    python -m actuarial.pipeline        (or `make actuarial`)
"""
from __future__ import annotations

import json
from pathlib import Path

from common.config import REPO_ROOT, get_logger

log = get_logger("actuarial.pipeline")


def main() -> dict:
    from actuarial.frequency import frequency_model
    from actuarial.pricing import pricing_adequacy, pricing_glm
    from actuarial.reserving import chain_ladder
    from actuarial.severity import severity_model

    results = {
        "frequency": frequency_model.main(),
        "severity": severity_model.main(),
        "pricing": pricing_glm.main(),
        "adequacy": pricing_adequacy.main(),
        "reserving": chain_ladder.main(),
    }
    out = Path(REPO_ROOT) / "actuarial" / "summary.json"
    out.write_text(json.dumps(results, indent=2, default=str))
    log.info("Actuarial suite complete → %s", out)

    r = results["reserving"]
    if r:
        log.info("──────── actuarial summary ────────")
        log.info("Portfolio loss ratio : %.1f%%", 100 * results["adequacy"].get("portfolio_loss_ratio", 0))
        log.info("Reserve (ultimate−paid): ${:,.0f}  [p95 ${:,.0f}]".format(
            r["total_reserve"], r["reserve_p95"]))
        log.info("Segments needing rate increase: %d",
                 results["adequacy"].get("under_priced", 0))
    return results


if __name__ == "__main__":
    main()
