# Concurrency Testing

Đọc toàn bộ reference này khi thay đổi synchronization, lifecycle, ordering hoặc shared state không tầm thường.

## Test oracle

- Test observable invariant: không mất/nhân đôi item, state transition hợp lệ, output order đúng contract, cancellation trả về và child work kết thúc.
- Không assert implementation detail như số lần lock hoặc thứ tự scheduler nếu chúng không thuộc contract.
- Mỗi regression giữ counterexample hoặc interleaving nhỏ nhất tái hiện lỗi.

## Điều khiển interleaving

- Dùng barrier, channel, latch, test hook hoặc controlled dependency để dừng task tại điểm đã biết rồi cho phép task khác chạy.
- Không dùng `sleep` để “cho goroutine chạy trước”. Timeout chỉ bảo vệ test khỏi treo và phải tạo failure rõ.
- Lặp test schedule-sensitive nhiều lần chỉ là lớp bổ sung; một test deterministic có interleaving kiểm soát được vẫn là oracle chính.

## Ma trận bắt buộc theo rủi ro

| Rủi ro thay đổi | Test tối thiểu |
|---|---|
| Shared mutation | Concurrent read/write vào cùng invariant; race detector ở Go |
| Lock/channel topology | Interleaving từng gây deadlock; timeout guard |
| Worker/task lifecycle | Success, error, cancellation đều join/cleanup |
| Bounded queue | Queue đầy áp dụng đúng backpressure/rejection và vẫn cancel được |
| Fan-out/fan-in | Không mất/duplicate; first-error/partial-result đúng contract |
| Ordered output | Input tie/duplicate và nhiều completion order vẫn cho cùng output |
| View/operation replacement | Kết quả cũ không cập nhật state mới |

## Race, deadlock và leak

- Race detector chỉ phát hiện execution đã xảy ra; phải tạo workload chạm đúng shared state và không coi một lần không báo race là proof hoàn chỉnh.
- Deadlock test phải ép các participant đến đúng wait point. Không tăng buffer để làm test pass nếu contract vẫn có cycle.
- Leak test nên đợi lifecycle signal của component, worker exit hoặc pending count về 0. Số goroutine toàn process có thể nhiễu và chỉ dùng khi có baseline/allowance rõ.

## Stress và determinism

- Dùng input đủ nhỏ để oracle rõ nhưng đủ contention để kích hoạt invariant.
- Chạy cùng seed/input qua nhiều worker count hợp lệ, bao gồm một worker và target concurrency.
- Nếu output cần deterministic, so sánh exact ordered result qua nhiều lần; không đổi test thành set comparison để che ordering drift.
- Ghi seed, task ID và phase đang chờ trong failure message để tái hiện được lỗi.
