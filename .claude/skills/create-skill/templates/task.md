# Task Skill Template

Use this for step-by-step workflows invoked manually (deployments, commits, code generation).

```yaml
---
name: <skill-name>
description: <What the task does. Use when X.>
disable-model-invocation: false
allowed-tools: <space-separated tools Claude can use without prompting>
---

# <Task Name>

<One-line summary of what this task does.>

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: <action>
- [ ] Step 2: <action>
- [ ] Step 3: <action>
- [ ] Step 4: Validate
- [ ] Step 5: Verify
```

### Step 1: <Action>

<Instructions>

### Step 2: <Action>

<Instructions>

### Step 3: <Action>

<Instructions>

### Step 4: Validate

<Run validation. If errors, return to the relevant step.>

### Step 5: Verify

<Final verification. Confirm output is correct.>
```
