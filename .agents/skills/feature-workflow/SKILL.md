---
name: feature-workflow
description: Automatically plan and deliver any new Promedia feature or non-trivial behavior change from pre-edit skill routing through implementation and verification. Use whenever a prompt adds user-visible behavior, a screen, endpoint, workflow, integration, processing capability, IPC, schema/config change, or cross-file refactor, even when the user does not name a skill. Do not use for review-only, documentation-only, formatting, or an isolated literal correction.
---

# Feature Workflow

Đây là cổng bắt buộc trước khi code một feature Promedia. Skill này điều phối quy trình; quy tắc chuyên môn vẫn thuộc các skill tương ứng.

## Preflight trước edit đầu tiên

1. Đọc `AGENTS.md`, cây thư mục gần feature, owner hiện tại, caller/consumer và test liên quan.
2. Tự phân loại intent, boundary và rủi ro theo các trigger bên dưới, chọn skill chuyên môn và đọc đầy đủ từng `SKILL.md` đã chọn trước khi sửa file; không chờ người dùng gọi tên skill.
3. Thông báo ngắn gọn skill đang dùng và lý do. Nếu có placement hoặc impact không tầm thường, ghi note theo skill tương ứng.
4. Chỉ bắt đầu edit khi source of truth, owner và dependency direction đã rõ. Nếu một điểm chưa rõ làm thay đổi behavior hoặc phạm vi, hỏi người dùng và tiếp tục các phần độc lập trong lúc chờ.

## Routing chuyên môn

- Behavior dùng chung, signature, export, config, API/IPC/schema hoặc data flow qua nhiều boundary: `change-impact`.
- Thêm hoặc di chuyển function, type, file/module/package, Service hoặc Engine: `feature-placement`.
- Tách/gộp folder hoặc package, API công khai không rõ, dependency cycle: `package-boundary`.
- Workflow ứng dụng phối hợp storage/provider với media, ML, parsing hoặc processing pipeline: `service-engine-boundary`.
- Feature trực tiếp resolve/configure/start/call FFmpeg, AI runtime/provider, storage hoặc queue dùng chung: `infrastructure-boundary`.
- Thuật toán không tầm thường, tính toán nặng, optimization/search, media/ML/parsing kernel, data structure nhạy hiệu năng hoặc yêu cầu correctness/numerical/determinism/resource rõ ràng: `algorithm-engineering`.
- Goroutine, channel, lock, atomic, worker pool, task queue, parallel stage, shared mutable state, worker thread, message port hoặc cancellation/ordering qua concurrent work: `concurrency-engineering`.
- Endpoint, payload, HTTP status/error, CORS/auth, timeout hoặc client API consumption: `client-server-contract`.
- Electron main/preload/renderer, IPC, filesystem, process, dialog, credential, notification hoặc window/native capability: `electron-boundary`.
- Renderer UI, layout, interaction, accessibility, i18n hoặc UX: `client-ui`.
- Server binding, LAN IP, CORS theo mạng nội bộ, firewall, discovery hoặc bằng chứng truy cập từ thiết bị khác: `lan-networking`.
- Thư viện, binary, model, codec hoặc engine tải theo nhu cầu và nằm ngoài client bundle: `external-runtime`.
- Build, package, installer, release artifact, kích thước gói, locale Electron hoặc yêu cầu một file phát hành: `build-release`.

Chỉ chọn skill có trigger thật. Một feature nhỏ trong owner rõ ràng không cần toàn bộ bộ skill.

## Implementation gate

- Dùng owner nhỏ nhất giữ được cohesion; không tạo abstraction hoặc package chỉ để chuẩn hóa hình thức.
- Cập nhật source of truth trước, sau đó caller, consumer, config, fixture, test và tài liệu bị ảnh hưởng.
- Giữ code, UI, application workflow, infrastructure và processing ở đúng boundary; public API phải tối thiểu.
- Trước khi feature chạm FFmpeg, AI runtime, storage hoặc queue, phải xác định infrastructure owner và capability contract; feature không tự tạo private path/client/connection/topic để gọi trực tiếp.
- Algorithm được trigger phải có algorithm note và oracle độc lập trước implementation; không dùng benchmark thay cho correctness test.
- Concurrency được trigger phải có concurrency note về ownership, synchronization, bounds, cancellation, lifecycle và ordering trước implementation.
- UI mới phải tuân theo `client-ui`, có đủ `vi`/`en`, không hardcode text và không làm nội dung vượt khỏi app shell.
- Feature media phải ghi processing placement `device`, `server` hoặc `hybrid`. Mặc định media không dùng AI chạy trên thiết bị, AI/model nặng chạy trên server và hybrid chỉ truyền dữ liệu tối thiểu cần cho phân tích; mọi ngoại lệ phải có lý do sản phẩm rõ ràng.

## Completion gate

1. Tìm lại identifier, path, literal, selector, config key và contract cũ có liên quan.
2. Rà impact map và phân loại từng vị trí: đã cập nhật, giữ tương thích có chủ đích hoặc chưa làm kèm lý do.
3. Chạy `node verify-base.mjs` để kiểm tra toàn bộ server/client, sau đó chạy test, typecheck, lint hoặc static check chuyên biệt cần thiết; không build nếu người dùng chưa yêu cầu.
4. Đọc lại toàn bộ file đã đổi, loại import/branch/reference thừa và xác nhận tên, control flow, responsibility vẫn dễ hiểu mà không cần suy đoán.
5. Dùng `architecture-audit` cho feature/refactor không tầm thường và sửa các regression thuộc phạm vi thay đổi.
6. Khi thay đổi tạo hoặc sửa luồng UI/E2E, khởi động base hiện tại và dùng `computer-use` xác minh đường đi sản phẩm cùng trạng thái liên quan. Function, package hoặc backend change nhỏ không đổi UI/E2E có thể hoàn tất bằng unit/integration/contract test phù hợp và ghi `computer-use: NOT REQUIRED` kèm lý do.
7. Nếu người dùng yêu cầu build/package/release, dùng `build-release` để kiểm tra artifact thật; compile hoặc thư mục staging không đủ để kết luận bản phát hành đạt yêu cầu.
