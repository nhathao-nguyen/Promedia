# Performance and Resource Validation

Đọc reference này khi có performance requirement, dataset lớn, optimization, streaming, concurrency hoặc claim giảm CPU/memory/latency.

## Định nghĩa trước khi đo

- Chuyển yêu cầu thành metric và budget cụ thể: latency percentile, throughput, CPU time, peak/RSS memory, allocation, startup time hoặc maximum input size.
- Ghi workload shape, input distribution, scale và concurrency. Một con số không gắn workload không phải performance contract.
- Chọn baseline: implementation hiện tại, reference đơn giản hoặc release gần nhất. Giữ output và correctness contract tương đương giữa các candidate.

## Benchmark đáng tin

- Tách setup, fixture load, network và I/O khỏi vùng đo nếu chúng không thuộc algorithm; giữ lại nếu end-to-end budget thực sự bao gồm chúng.
- Chạy nhiều sample trong cùng điều kiện, giữ toolchain, OS/architecture, power state và background load ổn định trong phạm vi có thể.
- Với Go, dùng `testing.B`, báo allocation khi có ý nghĩa và dùng `benchstat` cho A/B thay vì so một con số đơn lẻ.
- Với JavaScript/TypeScript, tính đến warm-up/JIT/GC; tránh benchmark nằm trong renderer đang có animation hoặc event workload không kiểm soát.
- Không dùng microbenchmark để tuyên bố end-to-end latency nếu serialization, IPC, filesystem hoặc network chiếm phần đáng kể.

## Scaling và input đối nghịch

- Đo nhiều scale đủ để thấy growth trend; đối chiếu với complexity dự kiến nhưng không suy ra Big-O chỉ bằng curve fitting.
- Thêm input gây worst-case hoặc degeneration có thể xảy ra: duplicate, skew, collision, deeply nested, incompressible, already sorted hoặc malformed tùy domain.
- Theo dõi timeout, queue growth, goroutine/task leak, peak memory và temporary disk usage. Timeout/OOM trên input hợp lệ hoặc không tin cậy phải được phân loại là behavior cần xử lý.

## Optimization workflow

1. Đo baseline và xác nhận bottleneck bằng profile khi chi phí thay đổi đáng kể.
2. Thay đổi một nguyên nhân chính có thể giải thích được.
3. Chạy correctness suite trước khi tin benchmark.
4. Lặp lại A/B và giữ optimization chỉ khi lợi ích vượt nhiễu, complexity và maintenance cost.
5. Ghi rõ môi trường, command, workload, sample count và limitation trong báo cáo.

Parallelism phải có bounded worker/queue, cancellation và backpressure. So sánh cả single-worker lẫn target concurrency để phát hiện coordination overhead hoặc contention.
