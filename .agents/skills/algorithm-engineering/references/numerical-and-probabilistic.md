# Numerical and Probabilistic Verification

Đọc reference này khi thuật toán dùng floating-point, fixed-point, randomness, sampling, optimization, ML score hoặc kết quả approximate.

## Numerical contract

- Ghi rõ đơn vị, range, precision cần thiết và behavior khi gặp `NaN`, positive/negative infinity, signed zero, overflow, underflow hoặc giá trị ngoài domain.
- Chọn `int`, fixed-point, `float32`, `float64`, `number`, `BigInt` hoặc decimal representation theo contract dữ liệu; không chọn chỉ vì tiện implementation.
- Không dùng exact equality cho floating-point nếu phép tính có rounding. Tolerance phải xuất phát từ sai số domain hoặc error analysis, không dùng một epsilon tùy ý cho mọi magnitude.
- Khi scale thay đổi lớn, cân nhắc kết hợp absolute và relative tolerance. Near-zero cần absolute tolerance; giá trị lớn thường cần relative tolerance.
- Kiểm tra kết quả trên Linux và Windows nếu numerical behavior phụ thuộc architecture, compiler, native library hoặc thứ tự song song.

## Stability và convergence

- Phân biệt mathematical formula đúng với implementation ổn định số. Kiểm tra cancellation, accumulation error, condition number và thứ tự phép toán khi có rủi ro thực tế.
- Iterative algorithm phải có termination condition, iteration cap, convergence metric và behavior khi không hội tụ.
- Approximation/optimization phải trả đủ diagnostic để caller phân biệt converged, partial, infeasible, cancelled và failed.

## Randomized và probabilistic behavior

- Seed phải inject được và được ghi trong failure output. Regression test dùng seed hoặc counterexample cố định.
- Tách correctness property tất định khỏi quality metric mang tính thống kê.
- Statistical test phải có sample size và acceptance threshold dựa trên requirement, tránh threshold sát nhiễu làm test flaky.
- Với heuristic, so sánh quality/cost trên dataset đại diện và adversarial; không chỉ báo best case hoặc trung bình không kèm phân phối.

## Oracle phù hợp

- Dùng implementation đơn giản nhưng rõ ràng cho input nhỏ làm differential oracle khi có thể.
- Kiểm tra identities, bounds, conservation law, monotonicity, symmetry hoặc metamorphic relation độc lập với implementation.
- Lưu case mất ổn định, không hội tụ hoặc seed gây lỗi thành regression fixture có nguồn gốc rõ ràng.
