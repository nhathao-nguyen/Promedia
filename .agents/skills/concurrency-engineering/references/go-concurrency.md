# Go Concurrency

Đọc toàn bộ reference này khi feature dùng goroutine, channel, `context`, `sync`, `sync/atomic`, worker pool hoặc pipeline.

## Ownership và structured lifetime

- Function tạo goroutine phải chỉ ra owner nào cancel và chờ nó kết thúc. Không để goroutine sống lâu hơn state, channel hoặc dependency mà nó sử dụng.
- Truyền `context.Context` từ caller cho work theo request/operation; không thay context của caller bằng `context.Background()` bên trong pipeline.
- Gọi cancel function do `WithCancel`/`WithTimeout` trả về trên mọi return path để giải phóng timer và descendant work.
- Dùng `WaitGroup` hoặc coordinator tương đương để join. Gọi `Add` trước khi goroutine có thể chạy; mỗi unit `Done` đúng một lần; không copy primitive sau khi dùng.

## Channel contract

- Ghi rõ producer, consumer, element ownership và closer cho mỗi channel.
- Sender/coordinator đóng outbound channel sau send cuối cùng. Receiver không đóng inbound channel.
- Nếu downstream có thể rời sớm, mọi upstream send phải select được cancellation hoặc được drain bởi owner có chủ đích.
- Buffer là throughput/backpressure decision, không phải cách sửa deadlock. Capacity phải có lý do từ số in-flight task hoặc stage contract.
- Không dùng channel vừa để truyền data vừa ngầm biểu diễn nhiều lifecycle state nếu contract trở nên mơ hồ; result có cấu trúc thường rõ hơn.

## Shared state và synchronization

- Go map không an toàn khi có concurrent write hoặc read/write. Bảo vệ toàn bộ invariant bằng một owner goroutine hoặc lock phù hợp.
- Chọn `Mutex` trước khi chứng minh `RWMutex` có lợi; reader lock vẫn phải bao phủ đúng invariant và không được nâng cấp ngầm thành writer lock.
- Định nghĩa lock order khi cần nhiều lock. Giảm nested locking; không giữ lock qua channel send/receive, callback hoặc I/O có thể block nếu không có proof rõ.
- Dùng atomic cho counter/flag/pointer độc lập với transition rõ. Không trộn atomic và non-atomic access trên cùng state; không dùng atomic flag để xuất bản mutable aggregate thiếu synchronization.
- Data được gửi qua channel phải có ownership rõ sau send; không tiếp tục mutate slice/map/pointer trong khi receiver có thể đọc.

## Worker pool, errors và ordering

- Số worker và queue phải bounded; worker count dựa trên CPU-bound/I/O-bound workload và benchmark, không dựa trên số item.
- Coordinator sở hữu task admission, close, cancellation, first-error/all-error semantics và join.
- Nếu first error làm kết quả không còn hợp lệ, cancel sibling work và vẫn đợi cleanup. Nếu cần partial result, contract phải nói rõ item nào thành công/thất bại.
- Gán sequence trước fan-out khi output cần deterministic order. Fan-in có thể buffer/reorder theo sequence, nhưng bộ đệm reorder cũng phải bounded.
- Không thêm `golang.org/x/sync/errgroup` chỉ vì tiện nếu standard library và owner hiện tại đủ rõ; nếu dependency đã có hoặc boundary thực sự cần, giới hạn concurrency và hiểu rõ cancellation semantics trước khi dùng.

## Verification phù hợp Go 1.22

- Promedia server hiện dùng Go 1.22; không dựa vào API concurrency test xuất hiện ở Go mới hơn.
- Dùng channel/barrier/hook kiểm soát được để ép interleaving cần kiểm tra. `time.Sleep` không phải synchronization; timeout chỉ là guard để test không treo vô hạn.
- Chạy targeted tests nhiều lần khi kiểm tra schedule-sensitive invariant và chạy `go test -race` trên package bị ảnh hưởng.
- Test cancellation khi worker đang block ở admission, receive, send và dependency call phù hợp với implementation.
- Test owner đợi toàn bộ child dừng. Tránh assert số goroutine toàn process tuyệt đối; ưu tiên lifecycle signal thuộc component đang test.
