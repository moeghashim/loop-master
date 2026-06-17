.PHONY: verify

verify:
	bash -n scripts/*.sh
	python3 scripts/check-markdown-links.py
