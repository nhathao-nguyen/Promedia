---
name: concurrency-engineering
description: Use when Promedia code introduces or changes goroutines, channels, locks, atomics, worker pools, parallel stages, shared mutable state, worker threads, message ports, concurrent cancellation, or behavior vulnerable to races, deadlocks, leaks, starvation, or nondeterministic ordering. Do not use for ordinary async I/O without shared state or parallel execution.
---

# Concurrency Engineering

Concurrency chỉ đúng khi ownership, synchronization và lifecycle tường minh; chạy nhanh hơn không chứng minh correctness.

- Dùng `algorithm-engineering` cho parallel algorithm; `service-engine-boundary` khi processing phối hợp workflow state.
- Dùng `electron-boundary` khi worker/process/message đi qua Electron; `change-impact` khi đổi contract dùng chung.

## Concurrency note bắt buộc trước khi code

Trước edit đầu tiên, ghi:

1. Unit chạy đồng thời và owner lifecycle của từng unit.
2. Dữ liệu immutable/transferred/single-owner/shared; ai được ghi.
3. Synchronization bảo vệ từng invariant.
4. Giới hạn worker, in-flight task, queue/buffer và behavior khi đầy.
5. Cancellation/deadline unblock mọi send, receive, wait, message.
6. Owner đóng/join, error semantics và output ordering/tie-break.
7. Test oracle cho race, deadlock, leak, cancellation và ordering.

Nếu ownership, ordering hoặc cancellation chưa rõ và đổi behavior, hỏi trước implementation phụ thuộc.

## Design gate

- Ưu tiên immutable data, transfer ownership hoặc một owner. Shared mutation phải được đồng bộ theo toàn invariant.
- Mọi goroutine/thread/task có owner, stop và join/wait path; không fire-and-forget vô chủ.
- Worker, queue và buffer phải bounded; khi đầy dùng backpressure, cancellable block hoặc structured error.
- Blocking point có success/error/cancellation path; downstream thoát không làm kẹt upstream.
- Sender/coordinator đóng channel đúng một lần sau send cuối; receiver không đóng inbound channel.
- Lock bảo vệ invariant được đặt tên; không callback/I/O/block dưới lock. Atomic chỉ dành cho state nhỏ, độc lập.
- Khi contract cần determinism, không phụ thuộc scheduler, map iteration hoặc message arrival; stable sequence/tie-break được gán trước fan-out.

## Routing

- Khi dùng Go goroutine, channel, `context`, `sync`, `sync/atomic`, worker pool hoặc pipeline, phải đọc [go-concurrency.md](references/go-concurrency.md).
- Khi dùng Node worker thread, Web Worker, Electron utility process, `MessagePort`, transferable buffer, `SharedArrayBuffer` hoặc `Atomics`, phải đọc [node-electron-concurrency.md](references/node-electron-concurrency.md).
- Khi thay đổi synchronization hoặc lifecycle không tầm thường, phải đọc [concurrency-testing.md](references/concurrency-testing.md) trước khi chọn test strategy.

## Flags

- Operation nhỏ nên không thể race; buffer lớn nên không thể kẹt.
- Atomic flag bảo vệ được aggregate shared state; `Promise.all` làm CPU-bound JavaScript chạy đa luồng.
- `sleep` làm test ổn định nên synchronization đã đúng.

Gặp red flag phải quay lại concurrency note; không vá bằng buffer lớn, delay hoặc retry ngẫu nhiên.

## Completion gate

1. Mọi task/goroutine/worker có owner, stop, join; resource được release trên mọi terminal path.
2. Test bound/backpressure, error, ordering và shared-state invariant theo rủi ro.
3. Với Go, chạy targeted test và `go test -race` khi môi trường hỗ trợ; báo nếu chưa chạy.
4. Không dùng timing pass hoặc một lần chạy thành công làm bằng chứng.
5. Dùng `architecture-audit` cho thay đổi không tầm thường và báo phần chưa thể xác minh.
