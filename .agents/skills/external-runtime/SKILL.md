---
name: external-runtime
description: Design, implement, or change Promedia lifecycle management for external libraries, binaries, models, codecs, or processing engines that must stay outside the Electron client bundle or server binary. Use for on-demand device runtimes and separately managed server runtimes.
---

# External Runtime

Keep large or optional engines outside the client build while giving each feature a predictable install-on-demand experience.

## Chọn runtime owner

Trước khi thêm catalog entry hoặc downloader, phân loại runtime theo processing placement của capability:

- `device`: media engine không dùng AI và xử lý file local mặc định thuộc client. Runtime được cài theo nhu cầu dưới Electron user data và được gọi qua Electron Main.
- `server`: AI/model nặng, provider runtime, batch nền hoặc engine xử lý dữ liệu server thuộc máy server. Chúng nằm ngoài Go binary và ngoài client catalog, dưới data directory/volume được cấu hình cho server.
- `hybrid`: server runtime chỉ phân tích dữ liệu tối thiểu; device runtime áp dụng kết quả lên media gốc khi có thể.

Không đóng cùng một runtime vào cả client và server theo mặc định. Nếu capability thật sự hỗ trợ nhiều execution backend, catalog/contract phải biểu diễn lựa chọn runtime rõ ràng và mỗi backend có lifecycle owner riêng. Dùng `service-engine-boundary` để quyết định placement trước khi thiết kế lifecycle.

## Core invariant

External runtimes must not live under client source, `out`, ASAR, packaged resources, or another directory included by `electron-builder`. Install them under an application-owned user-data directory, for example `<userData>/runtimes/<runtime-id>/<version>`, using Electron/Node path APIs on Windows and Linux.

Do not add a fake runtime declaration, placeholder download, or generic UI card before a real feature supplies a reviewable artifact source, license, integrity mechanism, and compatibility probe.

Server runtime và model cũng không được link, embed hoặc copy vào server executable chỉ để tạo một binary lớn. Cấu hình server sở hữu root directory/volume, version và credential cần thiết; secret không nằm trong marker, catalog công khai hoặc artifact phát hành. Client không được nhận server filesystem path, model path hoặc provider credential.

## Dynamic runtime catalog

Every real runtime must be declared in one validated data catalog. Feature UI, the Libraries page, preload, and main-process lifecycle code must read this catalog or typed status derived from it; they must not duplicate runtime facts.

The skill and generic UI/lifecycle code must never hardcode a particular feature name, engine name, version, byte size, artifact URL, checksum, install path, or platform filename. Those values belong to the catalog or to metadata resolved from an allowlisted upstream source at check/install time.

Each catalog entry must describe:

- a stable runtime ID and localized feature-facing name, description, privacy statement, and processing location;
- feature/capability requirements and technical component names as metadata, not UI constants;
- supported `win32`/`linux` architecture selectors;
- an allowlisted HTTPS owner/source and a deterministic release-channel/artifact selection policy;
- integrity metadata or a checksum artifact that resolves the selected artifact's SHA-256;
- archive type, declared entry files, license/source URL, and compatibility probe;
- dynamically resolved version, byte size, artifact URL, and checksum for the concrete install attempt.

Validate catalog schema and all upstream metadata before use. Fail closed when no artifact matches the declared platform/policy. Never put secrets or short-lived signed production URLs in source. Persist the resolved version, artifact identity, size, checksum, executable hashes, and install time in the installed marker so an installed runtime remains verifiable offline.

Catalog trong Electron chỉ là source of truth cho device runtime. Nếu server cần runtime catalog/registry, đặt source of truth riêng ở server vì platform, quyền truy cập, update policy và storage lifecycle khác client; không dùng client catalog như cấu hình triển khai server.

## State model and one-time prompt

The filesystem plus integrity validation is the source of truth, not a permanent “asked” boolean.

- `missing`: artifact or install marker is absent; show the feature-local download button.
- `invalid`: files, version, checksum, executable probe, or marker do not match; show repair/download again.
- `downloading`: disable duplicate actions and show progress/cancel state.
- `ready`: validation passes; hide the download button and enable the feature.
- `error`: keep retry visible with an actionable i18n message.

Ask only when the user enters or invokes the feature that needs the runtime. After a successful install, do not ask again. Re-check availability when the screen opens and immediately before use, so deleting or corrupting the runtime makes the button reappear automatically. A catalog refresh or newer upstream release alone must not force a working runtime prompt to reappear unless product update policy explicitly requires it.

## Feature gate and Libraries page

Every feature-local runtime gate follows the same product flow:

1. Check the declared requirement when the feature screen opens; do not check every runtime at app startup.
2. When missing/invalid, replace only the dependent feature area with a consent card whose main title is the localized feature name, not a bare technical library name.
3. Show resolved version, download size, processing location, privacy statement, license, and technical components before consent.
4. Show distinct resolving, downloading, verifying, extracting, installing, done, cancelled, and error states. Expose real byte progress when available and keep cancel/retry accessible.
5. On successful validation, remove the gate and reveal the actual feature UI automatically without requiring a restart or second click.
6. Call the narrow status API again immediately before launching the processing action. If validation fails, return to the gate and do not launch the runtime.

The desktop shell must also provide one Libraries route adjacent to Settings. It lists catalog entries and current filesystem-validated state, and allows the same install/repair operation there. This is a second entry point into the shared lifecycle, not a separate runtime registry or a copy of feature constants. Installed entries remain visible; missing/invalid entries expose install/repair when a verified source is available.

## Ownership and boundary

- Renderer owns feature-local and Libraries-page states and i18n UI; it never receives arbitrary filesystem or process access, source URLs, or install paths.
- Preload exposes narrow typed methods such as status, install, cancel, and remove for a declared runtime ID. Never expose raw IPC or arbitrary URLs/paths.
- Electron main owns the runtime directory, download, integrity verification, extraction, executable permissions, probe, cleanup, and process launch.
- Add the smallest shared runtime manager only when the first real engine exists. The catalog owns declarations, the feature owns its requirement and CTA, and the manager owns lifecycle mechanics, not feature workflow.
- Use `electron-boundary`, `client-ui`, `change-impact`, and `concurrency-engineering` when implementing the actual asynchronous download path. Artifact provenance and integrity are part of this lifecycle: require an allowlisted owner/source, deterministic release metadata, SHA-256 verification, archive safety checks, license evidence, and a compatibility probe before installation. Use `build-release` for packaged-artifact inspection. Do not reference an optional skill that is not present in this checkout.

## Safe installation

1. Check supported OS/architecture, available disk space, and the existing validated install.
2. Obtain explicit user consent from the feature-local button and show size/license information.
3. Download to a unique temporary file with timeout, cancellation, bounded concurrency, and size limits.
4. Verify SHA-256 before extraction. Reject redirects or final hosts outside the allowlist.
5. Extract with path-traversal and symlink protections into a temporary directory.
6. Validate the declared entry path/probe, then atomically rename into the versioned runtime directory.
7. Write the installed marker last. Remove partial files on failure/cancel and keep the previous valid version until replacement succeeds.

Never execute an unverified artifact. Do not use package-manager install scripts as an implicit runtime downloader.

## Verification

- Confirm the packaged file allowlist still excludes runtime directories; do not claim package-size success without inspecting an actual requested build artifact.
- Test missing, download consent, progress/cancel, checksum failure, successful validation, app restart, offline use of an installed runtime, manual deletion, and re-download.
- Use a real approved artifact or an anonymized internal fixture with the same archive/checksum structure; label fixture-only evidence clearly.
- Verify the complete Windows UI path with `computer-use`. Verify Linux-specific paths separately when behavior differs, and report targets not run.
- Với server runtime, kiểm tra server binary/package không chứa model/engine, config không chứa secret, runtime root thay đổi được và server fail closed khi runtime thiếu hoặc sai phiên bản.
