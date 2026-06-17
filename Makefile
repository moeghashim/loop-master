.PHONY: verify

verify:
	@for f in scripts/*.sh; do bash -n "$$f" || exit 1; done
	python3 scripts/check-markdown-links.py
