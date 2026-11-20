"""Seed MongoDB with the starter metadata schema and initial accounts.

Safe to run repeatedly: existing fields and users are never modified.

    python seed_db.py            # always seeds
    SEED_ON_START=true ...       # how the Docker entrypoint opts in

Accounts created:
  * an admin from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_DIVISION
    (skipped when ADMIN_PASSWORD is empty)
  * demo users alice (Division A) and bob (Division B) when SEED_DEMO_USERS=true
"""
import logging
import sys

from app.config import Config
from app.db import db_manager
from app.seed import run_seed

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s seed: %(message)s")


def main(force: bool) -> int:
    if not force and not Config.SEED_ON_START:
        logging.info("SEED_ON_START is not enabled; skipping seed.")
        return 0
    db_manager.initialize()
    result = run_seed(db_manager.db)
    print(f"Seed result: {result}")
    return 0


if __name__ == "__main__":
    # The entrypoint passes --if-enabled so seeding stays opt-in via env.
    sys.exit(main(force="--if-enabled" not in sys.argv))
