.PHONY: help install dev build lint test preview \
       functions-build functions-lint functions-test functions-watch functions-logs \
       emulators deploy deploy-functions deploy-hosting deploy-rules \
       clean

# ─── Defaults ────────────────────────────────────────────────────────
.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── Frontend ────────────────────────────────────────────────────────
install: ## Install all dependencies (root + functions)
	npm install
	cd functions && npm install

dev: ## Start Vite dev server
	npm run dev

build: ## TypeScript compile + Vite production build
	npm run build

lint: ## ESLint the frontend
	npm run lint

preview: ## Preview the production build locally
	npm run preview

# ─── Functions (Backend) ─────────────────────────────────────────────
functions-build: ## Build Cloud Functions (clean build per AGENTS.md rule #1)
	rm -rf functions/lib
	cd functions && npm run build

functions-lint: ## Lint Cloud Functions
	cd functions && npm run lint

functions-test: ## Run backend contract tests
	cd functions && npm run test:contracts

functions-watch: ## Watch-compile Cloud Functions
	cd functions && npm run build:watch

functions-logs: ## Tail Cloud Functions logs
	cd functions && npm run logs

# ─── Firebase Emulators ──────────────────────────────────────────────
emulators: ## Start all Firebase emulators
	firebase emulators:start

emulators-functions: ## Start emulators (functions only)
	firebase emulators:start --only functions

emulators-hosting: ## Start emulators (hosting only)
	firebase emulators:start --only hosting

# ─── Deploy ──────────────────────────────────────────────────────────
deploy: ## Deploy everything (hosting + functions + rules)
	firebase deploy

deploy-functions: functions-build ## Deploy Cloud Functions only (clean build first)
	firebase deploy --only functions

deploy-hosting: build ## Build then deploy hosting only
	firebase deploy --only hosting

deploy-rules: ## Deploy Firestore + Storage rules only
	firebase deploy --only firestore:rules,storage

# ─── Cleanup ─────────────────────────────────────────────────────────
clean: ## Remove build artifacts
	rm -rf dist
	rm -rf functions/lib
