# Agent Instructions

## Goal
Help with coding tasks while using the least necessary context and tokens.

## Project Scope
Only inspect, edit, or explain files directly related to the current task.

Do not scan the whole project unless explicitly asked.

## Default Behavior
- Make minimal changes.
- Prefer small, safe diffs.
- Do not refactor unrelated code.
- Do not rename files, functions, or variables unless required.
- Do not add new dependencies without asking first.
- Do not change formatting across unrelated files.
- Do not modify generated files, build output, or lockfiles unless necessary.

## Before Editing
For medium or large tasks:
1. Identify the relevant files.
2. Give a short plan.
3. Mention which files need changes.
4. Wait for approval if more than 3 files may be edited.

For small obvious fixes, edit directly.

## Context Rules
Avoid reading or using these unless directly needed:
- node_modules
- .next
- dist
- build
- coverage
- .git
- generated files
- large JSON files
- large logs
- package-lock.json / yarn.lock / pnpm-lock.yaml unless dependency-related
- .env files

## Coding Rules
- Follow the existing project style.
- Reuse existing utilities and components.
- Keep the current architecture.
- Prefer simple code over clever code.
- Add comments only when they clarify non-obvious logic.
- Do not introduce unnecessary abstractions.

## Testing / Verification
After changes, run the smallest relevant check first.

Prefer:
- targeted unit test
- lint for touched files
- typecheck
- build only when needed

Do not run expensive full-project commands unless necessary.

## Final Response Format
Keep the final answer short.

Include only:
1. Files changed
2. What changed
3. Tests/checks run
4. Anything still needed

Avoid long explanations unless asked.

## Token Saving Rules
- Do not repeat large code blocks in the response.
- Do not summarize untouched files.
- Do not explain basic concepts unless asked.
- Do not include long logs.
- Keep answers concise and task-focused.
