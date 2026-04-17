# Visual Skill Template

Use this for skills that generate HTML reports, diagrams, or visualizations via bundled scripts.

```yaml
---
name: <skill-name>
description: <Generates interactive visualization of X. Use when exploring Y or analyzing Z.>
allowed-tools: Bash(python *)
---

# <Visualization Name>

Generates an interactive HTML visualization of <subject>.

## Usage

Run the visualization script:

```bash
python ${CLAUDE_SKILL_DIR}/scripts/visualize.py $ARGUMENTS
```

This creates `<output-file>.html` in the current directory and opens it in the default browser.

## What the visualization shows

- <Feature 1>
- <Feature 2>
- <Feature 3>

## Customization

Pass flags to customize output:
- `--format <type>`: Output format
- `--output <path>`: Custom output path
```

## Directory structure

```
<skill-name>/
├── SKILL.md
└── scripts/
    └── visualize.py    # Main visualization script
```

The script should:
- Use only standard library when possible
- Generate self-contained HTML (no external dependencies)
- Auto-open the output in the browser
- Handle errors explicitly with helpful messages
