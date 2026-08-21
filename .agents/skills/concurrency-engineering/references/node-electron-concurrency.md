# Node and Electron Concurrency

Đọc toàn bộ reference này khi feature dùng Node worker thread, Web Worker, Electron utility process, `MessagePort`, transferable buffer, `SharedArrayBuffer` hoặc `Atomics`.

## Chọn execution boundary

- `Promise.all` chỉ điều phối Promise; nó không tự đưa CPU-bound JavaScript sang thread khác.
- Dùng async API cho I/O-bound work. Dùng worker thread/Web Worker/utility process cho CPU-bound work đủ lớn để bù chi phí clone, transfer và scheduling.
- Không chạy CPU-heavy hoặc blocking work trên Electron main hay renderer UI thread. Dùng `electron-boundary` để chọn main/preload/renderer/worker/process contract.
- Không tạo worker mới cho từng item trong workload lớn. Dùng pool có worker count và pending queue bounded; pool owner quản lý startup, admission, cancellation và shutdown.

## Message và memory ownership

- Mỗi task có ID, request payload serializable và terminal result/error đúng một lần. Owner giữ map pending và xóa entry trên success, error, cancellation hoặc worker exit.
- Ưu tiên immutable message hoặc transfer ownership của `ArrayBuffer` khi phù hợp. Sau transfer, sender không được tiếp tục dùng buffer đã detach.
- Structured clone có chi phí CPU/memory; đo payload thật trước khi chọn clone hay transfer.
- Chỉ dùng `SharedArrayBuffer` khi message/transfer không đáp ứng use case. Khi dùng, mọi field dùng chung phải có layout, writer/reader ownership và protocol `Atomics` rõ; không đọc/ghi shared memory ngoài protocol.
- Không truyền object có behavior/prototype và kỳ vọng worker nhận nguyên semantics; message contract chỉ dựa trên dữ liệu clone/transfer được.

## Lifecycle, cancellation và stale result

- Handle `message`, `messageerror`, `error` và `exit`; một task chỉ resolve/reject một lần kể cả khi nhiều event xảy ra.
- Worker exit bất thường phải reject hoặc requeue pending task theo semantics đã định; không để Promise treo.
- Cancellation cần operation/task ID và cooperative stop signal khi algorithm có thể kiểm tra. `terminate()` là cleanup fallback, không thay cho cancellation contract của pool.
- Khi view/operation đã đổi, generation hoặc operation ID ngăn kết quả cũ cập nhật state mới. Teardown phải remove đúng listener và release port.
- Shutdown owner ngừng nhận task mới, xử lý hoặc cancel queue theo contract, chờ in-flight task, đóng port và terminate worker còn lại.

## Ordering và backpressure

- Thứ tự message đến không phải output ordering contract. Gán sequence trước dispatch và reorder ở coordinator nếu cần stable output.
- Khi queue đầy, admission phải wait có cancellation hoặc reject có cấu trúc; không tăng array pending vô hạn.
- Không dùng synchronous IPC để chờ worker/process result vì sẽ block Electron thread gọi nó.

## Verification

- Dùng fake task nhỏ có barrier/message hook để kiểm tra interleaving, không dựa vào delay ngẫu nhiên.
- Test worker error/exit giữa task, duplicate terminal event, cancellation khi queued/in-flight, stale result, queue saturation và shutdown còn pending work.
- Test transfer semantics để bảo đảm sender không dùng buffer đã chuyển và receiver nhận đúng byte range.
- Nếu dùng shared memory, test protocol state transition với nhiều schedule và xác minh không có non-atomic access ngoài phần immutable.
