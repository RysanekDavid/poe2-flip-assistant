"""Keep the Coach implementation within the repository size constraints."""

import ast
from pathlib import Path

COACH_ROOT = Path(__file__).resolve().parents[1]


def test_python_files_and_functions_stay_bounded() -> None:
    violations: list[str] = []
    source_files = sorted((COACH_ROOT / "src").rglob("*.py"))
    test_files = sorted((COACH_ROOT / "tests").rglob("*.py"))
    for path in [*source_files, *test_files]:
        lines = path.read_text(encoding="utf-8").splitlines()
        relative = path.relative_to(COACH_ROOT)
        if len(lines) > 500:
            violations.append(f"{relative}: file has {len(lines)} lines")
        tree = ast.parse("\n".join(lines), filename=str(relative))
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                length = (node.end_lineno or node.lineno) - node.lineno + 1
                if length > 60:
                    violations.append(f"{relative}:{node.lineno} {node.name} has {length} lines")

    assert violations == []
