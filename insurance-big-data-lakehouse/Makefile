# ═══════════════════════════════════════════════════════════════════════════
#  Insurance Big-Data Lakehouse — one-command developer workflow
# ═══════════════════════════════════════════════════════════════════════════
.DEFAULT_GOAL := help
PY := python3

.PHONY: help venv seed-data demo-data topics stream-demo medallion-local \
        spark-bronze spark-silver spark-gold dbt-run actuarial ml-train \
        quality lineage catalog api dashboard test lint up down demo clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

venv: ## Create virtualenv and install dependencies
	python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt

# ── Data ─────────────────────────────────────────────────────────────────────
seed-data: ## Generate tiny deterministic seed dataset (data/seed/*.csv)
	$(PY) -m ingestion.synthetic.generator --scale seed

demo-data: ## Generate demo-scale synthetic data + landing JSONL (lakehouse/)
	$(PY) -m ingestion.synthetic.generator --scale demo

# ── Streaming (requires `make up` for a real Kafka broker) ──────────────────
topics: ## Create Kafka topics
	$(PY) -m ingestion.kafka.topics

stream-demo: ## Stream claims events into Kafka for 60s (produce)
	$(PY) -m streaming.claims_stream --mode produce --rate 20 --duration 60

# ── Medallion pipelines ──────────────────────────────────────────────────────
medallion-local: ## Run bronze→silver→gold with the pandas reference engine (no Spark needed)
	$(PY) -m spark.pandas_reference

spark-bronze: ## Run all bronze Spark jobs (Docker, profile "spark")
	docker compose --profile spark exec -T spark bash -c "for f in /opt/app/spark/bronze/bronze_*.py; do echo '▶' $$f && spark-submit $$f; done"

spark-silver: ## Run all silver Spark jobs (Docker, profile "spark")
	docker compose --profile spark exec -T spark bash -c "for f in /opt/app/spark/silver/silver_*.py; do echo '▶' $$f && spark-submit $$f; done"

spark-gold: ## Run all gold Spark jobs (Docker, profile "spark")
	docker compose --profile spark exec -T spark bash -c "for f in /opt/app/spark/gold/gold_*.py; do echo '▶' $$f && spark-submit $$f; done"

dbt-run: ## Run dbt models (requires profiles.yml — see dbt/README.md)
	cd dbt && dbt run && dbt test

# ── Analytics & ML ───────────────────────────────────────────────────────────
actuarial: ## Frequency/severity GLMs, pricing adequacy, chain-ladder reserving
	$(PY) -m actuarial.pipeline

ml-train: ## Train fraud, churn and risk models
	$(PY) -m ml.fraud.train_fraud_model && $(PY) -m ml.churn.train_churn_model && $(PY) -m ml.risk.risk_scoring

# ── Governance ───────────────────────────────────────────────────────────────
quality: ## Run the data-quality suite on silver + gold
	$(PY) -m governance.quality.quality_checks

lineage: ## Regenerate pipeline lineage graph (mermaid + json)
	$(PY) -m governance.lineage.lineage

catalog: ## Rebuild the data catalog / data dictionary
	$(PY) -m governance.catalog.catalog

# ── Serving ──────────────────────────────────────────────────────────────────
api: ## Start the FastAPI server (http://localhost:8000/docs)
	uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

dashboard: ## Start the Streamlit dashboard (http://localhost:8501)
	streamlit run dashboard/app.py

# ── Quality gates ────────────────────────────────────────────────────────────
test: ## Run the pytest suite
	$(PY) -m pytest

lint: ## Ruff lint
	ruff check .

# ── Docker stack ─────────────────────────────────────────────────────────────
up: ## Start Kafka, MinIO, Postgres, Trino, API, dashboard
	docker compose up -d --build

down: ## Stop the stack
	docker compose down -v

# ── End-to-end demo (no Docker needed) ───────────────────────────────────────
demo: ## Full local demo: data → medallion → actuarial → ML → governance
	$(MAKE) demo-data
	$(MAKE) medallion-local
	$(MAKE) actuarial
	$(MAKE) ml-train
	$(MAKE) quality
	$(MAKE) lineage
	$(MAKE) catalog
	@echo ""
	@echo "✅ Demo complete.  Start serving with:  make api   |   make dashboard"

clean: ## Remove generated lakehouse data and model binaries
	rm -rf lakehouse/bronze lakehouse/silver lakehouse/gold lakehouse/landing ml/models/*.joblib
