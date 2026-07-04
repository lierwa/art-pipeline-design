# Task 1 Report: Add Canvas Dependency Deliberately

## Status

- `DONE_WITH_CONCERNS`

## Scope

- Updated `frontend/package.json`
- Updated `frontend/package-lock.json`
- Updated `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`

Reason for the extra file touch:

- Task brief explicitly required importing tldraw CSS from the editor boundary, not from unrelated global code.
- I kept that import at the assembly editor boundary and added a Chinese WHY comment that tldraw is only an authoring implementation detail while the scene-package manifest remains the protocol.

## Changes made

1. Added `tldraw@5.2.2` to `frontend/package.json` dependencies.
2. Kept `react-arborist@^3.10.5` unchanged as the layer-tree library.
3. Ran `npm --prefix frontend install` to update the existing npm lockfile.
4. Imported `tldraw/tldraw.css` in `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx`.

## Verification log

### Install

Command:

```bash
npm --prefix frontend install
```

Output:

```text
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@yaireo/tagify@4.37.1',
npm WARN EBADENGINE   required: { node: '>=22', pnpm: '>=10' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: 'tldraw@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/driver@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/editor@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/store@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/utils@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/state@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/state-react@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/tlschema@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@tldraw/validate@5.2.2',
npm WARN EBADENGINE   required: { node: '>=22.12.0' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }
npm WARN deprecated lodash.isequal@4.5.0: This package is deprecated. Use require('node:util').isDeepStrictEqual instead.

added 101 packages, changed 13 packages, and audited 346 packages in 1m

59 packages are looking for funding
  run `npm fund` for details

5 vulnerabilities (3 moderate, 1 high, 1 critical)

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

Result:

- Install completed with exit code `0`.
- Current macOS install is not clean because `tldraw@5.2.2` and its `@tldraw/*` packages declare Node `>=22.12.0`, while this machine is `node v21.7.3`.

### Build

Command:

```bash
npm --prefix frontend run build
```

Output:

```text
> art-pipeline-workbench-frontend@0.1.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
transforming...
✓ 2136 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.41 kB │ gzip:   0.27 kB
dist/assets/index-C7sn1Yyv.css  170.07 kB │ gzip:  32.74 kB
dist/assets/index-DrweSSTK.js   833.41 kB │ gzip: 243.33 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 3.14s
```

Result:

- Build completed with exit code `0`.

## Concerns

1. The required version `tldraw@5.2.2` installs and builds here, but npm reports an engine mismatch because local Node is `v21.7.3` and tldraw declares `>=22.12.0`.
2. Windows lock/install verification has not been run in this session. Per the task brief, cross-platform readiness cannot be claimed until CI or a Windows runner validates install/lockfile behavior.
3. `npm install` updated some transitive versions already present in the lockfile (for example `@radix-ui/react-alert-dialog` `1.1.17 -> 1.1.18`) as part of normal npm resolution while adding tldraw.

## Commits

- None

---

## 2026-07-03 Review finding fix notes

This section supersedes the earlier `tldraw@5.2.2`-specific concerns above and is the authoritative status for the review-fix pass.

### What changed in this fix pass

1. Updated `frontend/package.json` from `tldraw@5.2.2` to exact `tldraw@5.1.0`.
2. Re-ran `npm --prefix frontend install` so `frontend/package-lock.json` matches the revised Task 1 brief and the actual npm resolution result.
3. Kept the existing tldraw CSS import at the editor boundary in `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx` with the Chinese WHY comment unchanged.

### Task 1 ownership clarification for `AssemblyWorkspacePanel.tsx`

- This file already contains pre-existing dirty behavior changes compared with the original base diff.
- In this review-fix pass, Task 1 only owns the top-of-file `import "tldraw/tldraw.css";` and the adjacent Chinese WHY comment.
- I did **not** revert the other pre-existing behavior diff in this file, per controller instruction.

### Install verification

Command:

```bash
npm --prefix frontend install
```

Output:

```text
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@yaireo/tagify@4.37.1',
npm WARN EBADENGINE   required: { node: '>=22', pnpm: '>=10' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }

added 2 packages, changed 9 packages, and audited 348 packages in 21s
```

Result:

- Exit code `0`.
- The previous `tldraw@5.2.2` / `@tldraw/*` Node `>=22.12.0` engine warnings are gone after pinning `5.1.0`.
- The remaining engine warning is from pre-existing dependency `@yaireo/tagify@4.37.1`, not from Task 1's tldraw pin.

### Build verification

Command:

```bash
npm --prefix frontend run build
```

Output:

```text
> art-pipeline-workbench-frontend@0.1.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ built in 3.20s
```

Result:

- Exit code `0`.

### Lockfile churn assessment

- I did not scan `node_modules`; this assessment is based on `frontend/package-lock.json` plus `npm view tldraw@5.1.0 dependencies --json`.
- The lockfile still changes substantially because `tldraw@5.1.0` brings a new transitive subtree, including:
  - `@tldraw/driver`, `@tldraw/editor`, `@tldraw/store`, `@tldraw/state`, `@tldraw/state-react`, `@tldraw/tlschema`, `@tldraw/utils`, `@tldraw/validate`
  - `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-code`, `@tiptap/extension-highlight`, `@tiptap/extension-list`
  - `radix-ui`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-toast`, `@radix-ui/react-tooltip`
  - `prosemirror-*`, `classnames`, `idb`, `lz-string`
- The visible `@radix-ui/react-alert-dialog` / `@radix-ui/react-toast` / `@radix-ui/react-tooltip` patch bumps in the lockfile come from that new `radix-ui` subtree required by `tldraw`, so they are not independent Task-1-unrelated upgrades.

### Non-destructive Windows lockfile resolution check

Command:

```bash
tmpdir=$(mktemp -d)
cp frontend/package.json "$tmpdir/package.json"
cp frontend/package-lock.json "$tmpdir/package-lock.json"
npm --prefix "$tmpdir" install --package-lock-only --ignore-scripts --os=win32 --cpu=x64
rc=$?
rm -rf "$tmpdir"
exit $rc
```

Output:

```text
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: '@yaireo/tagify@4.37.1',
npm WARN EBADENGINE   required: { node: '>=22', pnpm: '>=10' },
npm WARN EBADENGINE   current: { node: 'v21.7.3', npm: '10.5.0' }
npm WARN EBADENGINE }

up to date, audited 395 packages in 2s
```

Result:

- Exit code `0`.
- This proves the current `package.json` + `package-lock.json` can be re-resolved for `win32/x64` without mutating the real workspace lockfile.
- This is **not** the same as a native Windows install/build run, so Windows readiness is still **not claimed**.
