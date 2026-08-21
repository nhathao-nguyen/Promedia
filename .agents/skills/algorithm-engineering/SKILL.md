---
name: algorithm-engineering
description: Engineer non-trivial Promedia algorithms whose correctness, numerical behavior, complexity, determinism, or resource use must be explicit. Use before implementing or materially changing computation-heavy algorithms, optimization/search, media/ML/parsing kernels, concurrency-sensitive processing, or performance-critical data structures. Do not use for ordinary CRUD, orchestration, UI, simple mapping/validation, or a trivial library call.
---

# Algorithm Engineering

Thiết kế và triển khai thuật toán dựa trên đặc tả có thể kiểm chứng. Không tự biến yêu cầu mơ hồ thành behavior sản phẩm, không tối ưu dựa trên cảm giác và không dùng benchmark thay cho kiểm tra tính đúng.

## Boundary với các skill khác

- Skill này sở hữu cách chứng minh tính đúng, lựa chọn thuật toán, độ phức tạp, số học, tính xác định và hiệu năng của phần xử lý.
- Dùng `service-engine-boundary` khi processing được phối hợp với storage, provider, durable job state hoặc application workflow; không mặc định tạo Engine chỉ vì có thuật toán.
- Dùng `feature-placement` hoặc `package-boundary` nếu phải thêm hay di chuyển function, module, type hoặc package.
- Dùng `change-impact` khi đổi signature, config, data format hoặc behavior dùng chung; dùng `client-server-contract` nếu kết quả đi qua API.
- Dùng `concurrency-engineering` khi implementation thêm goroutine/thread, worker pool, shared mutable state, synchronization, parallel stage hoặc cancellation giữa concurrent work.
- Phần xử lý nặng không thuộc Electron renderer. Nếu cần worker, native process, filesystem hoặc IPC, dùng `electron-boundary` để chọn boundary an toàn.

## Preflight bắt buộc trước khi code

Đọc implementation gần nhất, caller, test, fixture và dữ liệu thực tế liên quan. Trước edit implementation đầu tiên, ghi một algorithm note ngắn trong commentary hoặc plan, gồm:

1. Mục tiêu tính toán và oracle dùng để biết kết quả đúng.
2. Miền input: type, đơn vị, kích thước, input rỗng/lỗi và giới hạn hợp lệ.
3. Semantics output: thứ tự, tie-break, độ chính xác, determinism và trạng thái lỗi.
4. Invariant, precondition và postcondition quan trọng.
5. Giới hạn thời gian, bộ nhớ, độ trễ, throughput hoặc concurrency nếu có.
6. Baseline/reference implementation và mục tiêu độ phức tạp thời gian/bộ nhớ.
7. Các quyết định sản phẩm còn thiếu và giả định nhỏ có thể kiểm chứng.

Nếu chưa có oracle, semantics hoặc giới hạn có thể làm thay đổi thuật toán, phải hỏi người dùng trước khi triển khai phần phụ thuộc. Có thể tiếp tục khảo sát hoặc dựng test harness độc lập, nhưng không được coi một prototype suy đoán là implementation hoàn tất.

## Chọn thuật toán

- Ưu tiên phương án đơn giản nhất đáp ứng đúng constraint hiện tại. So sánh candidate bằng tính đúng, worst-case, average-case khi có ý nghĩa, memory growth, determinism và độ khó vận hành.
- Phân biệt độ phức tạp lý thuyết với chi phí thực tế như allocation, cache, I/O, serialization, network hoặc startup. Không suy ra Big-O chỉ từ vài điểm benchmark.
- Ưu tiên standard library hoặc dependency đã có nếu semantics phù hợp. Chỉ thêm dependency khi lợi ích hiện tại lớn hơn chi phí API, license, security, kích thước và bảo trì.
- Định nghĩa rõ ordering và tie-break; không phụ thuộc ngẫu nhiên vào map iteration, scheduling hoặc implementation detail.
- Chỉ dùng approximate, heuristic hoặc randomized algorithm khi requirement cho phép; phải nêu quality bound, termination rule và seed/reproducibility contract.
- Không tối ưu trước khi có baseline hoặc bottleneck đo được, trừ khi constraint chứng minh phương án hiện tại không thể đáp ứng.

## Triển khai phần lõi

- Giữ algorithm core tách khỏi HTTP, UI, storage và durable job state. Nhận input/config rõ ràng và trả result/diagnostic có cấu trúc.
- Làm rõ ownership của buffer, slice, array, typed array và scratch resource; tránh mutation hoặc aliasing ngầm giữa caller và algorithm.
- Kiểm tra integer overflow/underflow, conversion mất dữ liệu, đơn vị đo, boundary index, zero-length input và allocation theo input không tin cậy.
- Với công việc dài, nhận cancellation/deadline từ caller, kiểm tra tại granularity hợp lý và trả lỗi phân loại được. Bounded concurrency và bounded queue phải có owner rõ ràng.
- Chỉ thêm parallelism sau khi chứng minh phần việc đủ lớn và độc lập; kiểm tra race, ordering, deterministic output và chi phí coordination.
- Randomized behavior phải cho phép cố định và ghi lại seed để tái hiện lỗi. Không dùng clock hoặc global random source làm input ẩn nếu kết quả cần tái lập.
- Comment bằng tiếng Việt chỉ giải thích invariant, proof idea, numerical trade-off hoặc lý do chọn thuật toán không hiển nhiên; không diễn giải từng câu lệnh.

## Ma trận kiểm tra tính đúng

Chọn các lớp kiểm tra phù hợp với rủi ro, không bắt buộc dùng mọi kỹ thuật cho mọi thuật toán:

1. Example test từ dữ liệu thật hoặc fixture đã ẩn danh, có expected result độc lập.
2. Boundary test cho empty/singleton, min/max, duplicate, sorted/reverse, malformed, kích thước lớn và input đối nghịch phù hợp domain.
3. Differential test so với reference implementation đơn giản, thư viện chuẩn hoặc implementation cũ khi có oracle đáng tin.
4. Property/metamorphic test cho invariant như round-trip, idempotence, conservation, monotonicity, permutation invariance hoặc equivalence.
5. Fuzz test cho parser, decoder, input phức tạp/không tin cậy hoặc API có không gian input lớn; seed corpus phải chứa case biên và case lỗi đã tìm thấy.
6. Regression test cho mọi counterexample đã được sửa; giữ input nhỏ nhất vẫn tái hiện được lỗi.

Test không được sao chép cùng control flow với implementation vì sẽ lặp lại cùng lỗi. Nếu output là approximate hoặc probabilistic, đọc [numerical-and-probabilistic.md](references/numerical-and-probabilistic.md) trước khi quyết định oracle và tolerance.

## Kiểm tra hiệu năng và tài nguyên

Chỉ đưa ra claim hiệu năng khi có requirement và phép đo phù hợp. Nếu thay đổi nhằm tối ưu, có giới hạn latency/throughput/memory, xử lý dữ liệu lớn hoặc thêm concurrency, phải đọc [performance-validation.md](references/performance-validation.md).

- Benchmark trên input đại diện cho phân phối thật và ít nhất một scale hoặc pattern đối nghịch có thể xảy ra.
- Tách setup/I/O không thuộc algorithm khỏi vùng đo; giữ input, environment và cấu hình so sánh ổn định.
- Đo lặp lại và so sánh baseline/candidate; không kết luận từ một lần chạy hoặc chênh lệch nằm trong nhiễu.
- Theo dõi cả thời gian, allocation/memory và degradation theo kích thước input khi chúng thuộc constraint.
- Profile trước khi thực hiện tối ưu hóa phức tạp; giữ optimization chỉ khi test vẫn đúng và bằng chứng đo lường cho thấy lợi ích đáng kể.

## Quy tắc theo runtime Promedia

### Go server

- Ưu tiên table-driven test cho case cụ thể và native fuzzing cho target phù hợp; lỗi fuzz phải trở thành seed/regression case có thể chạy lại bằng test thông thường.
- Dùng benchmark của `testing` và công cụ so sánh thống kê như `benchstat` khi cần claim A/B. Setup đắt phải nằm ngoài vùng đo.
- Chạy race detection cho thay đổi concurrency khi môi trường cho phép và báo rõ nếu chưa chạy.

### TypeScript/Electron

- Chỉ giữ tính toán nhẹ, gắn trực tiếp với presentation trong renderer. Processing nặng phải được đặt ở server hoặc boundary phù hợp để không chặn UI thread.
- Xác định rõ giới hạn `number`, integer an toàn, `BigInt`, typed array và serialization trước khi port thuật toán từ Go hoặc thư viện khác.
- Dùng test runner hiện có. Không thêm framework test/property/benchmark chỉ cho một feature nếu chưa có lợi ích đủ rõ; có thể dùng deterministic harness nhỏ trong boundary hiện hữu.

## Completion gate

Trước khi báo hoàn tất:

1. Đối chiếu implementation với algorithm note và cập nhật mọi giả định đã thay đổi.
2. Chứng minh oracle không phụ thuộc vào implementation đang test và các invariant chính đều có test phù hợp.
3. Xác minh malformed, boundary, cancellation, determinism và resource limit thuộc phạm vi feature.
4. Chạy test/fuzz seed/typecheck/static check nhỏ nhất phù hợp; không build nếu người dùng chưa yêu cầu.
5. Chỉ báo cải thiện hiệu năng khi có baseline, kết quả lặp lại và môi trường đo được ghi rõ.
6. Dùng `architecture-audit` cho thay đổi không tầm thường; báo riêng phần đã pass, chưa chạy, không thể kiểm tra và giới hạn dữ liệu/benchmark.

Không coi feature hoàn tất chỉ vì happy path pass, benchmark nhanh hơn hoặc code có vẻ đúng khi chưa có oracle độc lập.
