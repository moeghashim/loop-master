#!/usr/bin/env python3
"""Validate local markdown links and heading anchors."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def markdown_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*.md")
        if ".git" not in path.parts
    )


def strip_fenced_blocks(text: str) -> str:
    lines: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            lines.append("")
            continue
        lines.append("" if in_fence else line)
    return "\n".join(lines)


def github_anchor(text: str) -> str:
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.strip().lower()
    text = "".join(ch for ch in text if ch.isalnum() or ch in " -_")
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def anchors_for(path: Path) -> set[str]:
    seen: dict[str, int] = {}
    anchors: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = HEADING_RE.match(line)
        if not match:
            continue
        base = github_anchor(match.group(2))
        count = seen.get(base, 0)
        seen[base] = count + 1
        anchors.add(base if count == 0 else f"{base}-{count}")
    return anchors


def is_external(target: str) -> bool:
    scheme = urlsplit(target).scheme
    return scheme in {"http", "https", "mailto"}


def resolve_target(source: Path, target: str) -> tuple[Path, str]:
    parsed = urlsplit(target)
    file_part = unquote(parsed.path)
    anchor = unquote(parsed.fragment)
    target_path = source if file_part == "" else (source.parent / file_part)
    return target_path.resolve(), anchor


def main() -> int:
    errors: list[str] = []
    anchor_cache: dict[Path, set[str]] = {}

    for source in markdown_files():
        rel_source = source.relative_to(ROOT)
        text = strip_fenced_blocks(source.read_text(encoding="utf-8"))
        for match in LINK_RE.finditer(text):
            target = match.group(1).strip()
            if not target or is_external(target):
                continue
            target_path, anchor = resolve_target(source, target)
            if not target_path.exists():
                errors.append(f"{rel_source}: missing link target {target}")
                continue
            if anchor and target_path.suffix.lower() == ".md":
                anchors = anchor_cache.setdefault(target_path, anchors_for(target_path))
                normalized = github_anchor(anchor)
                if normalized not in anchors:
                    target_rel = target_path.relative_to(ROOT)
                    errors.append(f"{rel_source}: missing anchor #{anchor} in {target_rel}")

    if errors:
        print("markdown link check failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("markdown links: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
