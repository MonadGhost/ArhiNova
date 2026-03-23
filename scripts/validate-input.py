#!/usr/bin/env python3
"""Validate JSON Lines from stdin: Shannon entropy + prompt injection detection."""
import json
import math
import re
import sys
from collections import Counter

ENTROPY_THRESHOLD = 4.5

# Patterns ported from src/security/external-content.ts SUSPICIOUS_PATTERNS
INJECTION_PATTERNS = [
    ("ignore_previous", re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)", re.I)),
    ("disregard_previous", re.compile(r"disregard\s+(all\s+)?(previous|prior|above)", re.I)),
    ("forget_instructions", re.compile(r"forget\s+(everything|all|your)\s+(instructions?|rules?|guidelines?)", re.I)),
    ("role_override", re.compile(r"you\s+are\s+now\s+(a|an)\s+", re.I)),
    ("new_instructions", re.compile(r"new\s+instructions?:", re.I)),
    ("system_override", re.compile(r"system\s*:?\s*(prompt|override|command)", re.I)),
    ("exec_command", re.compile(r"\bexec\b.*command\s*=", re.I)),
    ("elevated_true", re.compile(r"elevated\s*=\s*true", re.I)),
    ("rm_rf", re.compile(r"rm\s+-rf", re.I)),
    ("delete_all", re.compile(r"delete\s+all\s+(emails?|files?|data)", re.I)),
    ("system_tag", re.compile(r"</?system>", re.I)),
    ("role_injection", re.compile(r"\]\s*\n\s*\[?(system|assistant|user)\]?:", re.I)),
    ("bracket_role", re.compile(r"\[\s*(System\s*Message|System|Assistant|Internal)\s*\]", re.I)),
    ("system_prefix", re.compile(r"^\s*System:\s+", re.I | re.M)),
]


def shannon_entropy(text: str) -> float:
    """H = -Σ p(x) log₂ p(x). Returns 0.0 for empty string."""
    if not text:
        return 0.0
    counts = Counter(text)
    length = len(text)
    entropy = -sum((c / length) * math.log2(c / length) for c in counts.values())
    return entropy + 0.0  # normalize -0.0 to 0.0


def validate_line(text: str) -> dict:
    """Returns dict with keys: text, entropy, high_entropy, injection_patterns, valid."""
    entropy = shannon_entropy(text)
    matched = [name for name, pat in INJECTION_PATTERNS if pat.search(text)]
    return {
        "text": text,
        "entropy": round(entropy, 4),
        "high_entropy": entropy > ENTROPY_THRESHOLD,
        "injection_patterns": matched,
        "valid": len(matched) == 0,
    }


def main() -> int:
    """Read JSON Lines from stdin, write validated JSON Lines to stdout.
    Returns 1 if any injection detected, 0 otherwise."""
    found_injection = False
    for raw_line in sys.stdin:
        raw_line = raw_line.rstrip("\n")
        if not raw_line:
            continue
        try:
            obj = json.loads(raw_line)
            if not isinstance(obj, dict) or "text" not in obj:
                raise ValueError("missing text field")
            result = validate_line(obj["text"])
            if result["injection_patterns"]:
                found_injection = True
        except (json.JSONDecodeError, ValueError):
            result = {"error": "invalid_input", "line": raw_line[:200]}
        print(json.dumps(result, ensure_ascii=False))
    return 1 if found_injection else 0


if __name__ == "__main__":
    sys.exit(main())
