---
name: service-engine-boundary
description: Separate Promedia application workflow responsibilities from non-trivial processing responsibilities. Use when behavior coordinates repositories, storage, providers, job state, or authorization together with media, ML, parsing, rendering, or another processing pipeline.
---

# Service vs Engine Boundary

Service and Engine describe responsibility roles, not structural levels or required class names. Either role may be implemented by a function, type, or cohesive module inside an existing package.

## Service role

A Service owns an application use case. It may:

- load and validate required state;
- enforce authorization and use-case rules;
- coordinate repositories, storage, providers, and engines;
- select a strategy or backend;
- own application-level transactions, idempotency, and retry policy;
- update durable job/status state;
- persist and publish the application result.

A Service should say what the application is accomplishing. It should not contain deep media, ML, parsing, or rendering details.

## Engine role

An Engine owns complex processing. It may:

- execute multiple transformation stages;
- own processing-specific configuration and in-memory state;
- coordinate codecs, models, parsers, or lower-level algorithm adapters;
- produce processing results, diagnostics, and progress events;
- manage scratch resources created solely by its processing pipeline.

An Engine should not decide authorization, own HTTP concerns, update application job records directly, or coordinate unrelated use cases.

## Vị trí xử lý mặc định của Promedia

Phân loại Service/Engine không tự quyết định tiến trình phải chạy ở client hay server. Trước khi triển khai một capability media, phải ghi rõ `device`, `server` hoặc `hybrid` dựa trên nơi dữ liệu tồn tại, tài nguyên tính toán, yêu cầu tiếp tục khi client tắt, quyền riêng tư và nhu cầu cộng tác.

- Media không dùng AI như probe, thumbnail, waveform, cắt, ghép, crop, resize, chuyển mã, nén, tách/ghép âm thanh, subtitle, watermark và scene detection thông thường mặc định chạy trên thiết bị. Electron Main sở hữu local use case và vòng đời tiến trình; renderer chỉ giữ UI state.
- AI/model nặng, provider cần credential, dữ liệu dùng chung, durable job, batch cần tiếp tục khi client tắt hoặc xử lý cần tài nguyên tập trung mặc định chạy ở server.
- Luồng hybrid phải để server trả kết quả phân tích có cấu trúc như transcript, timestamp, vùng, timeline hoặc processing plan; client áp dụng kết quả lên media gốc bằng engine local khi có thể.
- Không tải media gốc lên server chỉ để thực hiện thao tác local. Khi AI server cần nội dung, chỉ gửi phần tối thiểu đáp ứng contract như audio, frame, chunk hoặc proxy; phải làm rõ consent, giới hạn kích thước, retention và cleanup.
- Feature local không được phụ thuộc server chỉ để forward một lệnh engine. Nếu authorization, preset hoặc business rule nằm ở server, server trả quyết định/plan; Electron Main vẫn sở hữu filesystem, tiến trình local, progress và output.
- Chỉ chuyển media processing thông thường lên server khi có lý do sản phẩm cụ thể: media đã ở server, collaboration, reproducibility tập trung, batch nền, thiết bị không đủ tài nguyên hoặc người dùng chủ động chọn server processing. Ghi rõ trade-off upload, privacy, latency và failure mode.

Dùng `electron-boundary` và `external-runtime` cho engine chạy trên thiết bị; dùng `client-server-contract` cho server hoặc hybrid. Engine/model chạy trên server không được khai báo như runtime client.

FFmpeg/media runtime, AI provider/runtime, storage và queue là shared infrastructure surface. Service/Engine phải nhận capability hoặc port từ owner tương ứng thay vì tự resolve executable, tạo provider/storage/queue client hoặc đọc credential. Dùng `infrastructure-boundary` trước khi thêm hoặc thay đổi các dependency này.

When an Engine owns a non-trivial algorithm, performance-sensitive data structure, numerical computation, optimization/search, or media/ML/parsing kernel, use `algorithm-engineering` for its correctness and resource contract. This does not require creating a separate Engine when a cohesive function or module remains sufficient.

When a Service or Engine starts concurrent work, shares mutable state, uses worker pools/queues, or coordinates cancellation and ordering across parallel stages, use `concurrency-engineering`. The Service still owns application workflow state; the concurrent component owns only its scoped execution and cleanup.

## Lifecycle ownership

- The Service owns durable workflow state, business retries, idempotency, and mapping processing outcomes to application status.
- The Engine must honor cancellation/deadlines supplied by its caller and stop work promptly when safe.
- Engine progress should use a processing-neutral callback, channel, or event contract; the Service decides whether and how to persist or expose it.
- The Engine cleans up its scratch resources. The Service coordinates cleanup of application records or externally owned artifacts.
- Return structured errors that let the Service distinguish cancellation, invalid input, unavailable dependencies, and processing failure without depending on low-level implementation text.

## When one component is enough

- Use only a Service when processing is trivial and orchestration is the main complexity.
- Use only an Engine when the caller already owns the workflow and the capability is purely processing.
- Use neither when an ordinary function or module is sufficient.

Do not add a Service that only forwards one call or an Engine that only renames a helper.

## Dependency direction

Prefer:

```text
entrypoint
    -> service/use-case
        -> engine
        -> repository/storage/provider ports
```

An Engine may depend on lower-level algorithm/model/codec adapters. It should not depend upward on an application Service.

## Interface and port rule

Introduce a port/interface when external infrastructure must be isolated, multiple implementations exist now, runtime selection is required, or dependency inversion establishes a real boundary.

A test substitute may confirm that a boundary is useful, but mocking convenience alone is not enough. In Go, prefer narrow consumer-owned interfaces. Do not create an interface for every implementation.

## Final check

- Is orchestration separate from processing detail?
- Are durable state and authorization outside the Engine?
- Are cancellation, progress, error, and cleanup ownership explicit?
- Can the Engine implementation change without rewriting the use case?
- Do Services/Engines consume shared infrastructure through one explicit owner instead of feature-private integrations?
- Have unnecessary Service-to-Service chains and Engine wrappers been avoided?
