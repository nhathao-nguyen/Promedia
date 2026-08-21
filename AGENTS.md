# Promedia Project Instructions

## Phạm vi

Các quy tắc này áp dụng cho toàn bộ repository:

- `server/`: backend Go.
- `promedia-client/`: desktop client Electron + Vite + TypeScript + Tailwind.

## Quy tắc build

- Không tự chạy build nếu người dùng chưa yêu cầu rõ ràng.
- Không tự chạy `go build`, `npm run build`, `npm run dist`, `electron-builder` hoặc các lệnh đóng gói tương đương trong quá trình code thông thường.
- Khi người dùng yêu cầu build, chỉ build và kiểm tra cho Linux và Windows.
- Không build hoặc đóng gói cho macOS.
- Khi báo cáo kết quả build, phải nêu rõ target đã chạy và target chưa chạy.
- Khi yêu cầu liên quan build, package, installer, release artifact, kích thước gói hoặc một file phát hành, phải dùng skill `build-release` trước khi chạy lệnh đóng gói.

## Cách làm việc khi yêu cầu chưa rõ

- Khi một điểm chưa rõ có thể làm thay đổi behavior, giao diện, dữ liệu hoặc phạm vi thay đổi, phải hỏi lại trước khi thực hiện phần phụ thuộc vào điểm đó; không tự chọn một hướng quan trọng rồi coi đó là yêu cầu của người dùng.
- Câu hỏi cần hiển thị các lựa chọn ngắn gọn, dễ chọn và luôn có ô nhập câu trả lời tự do cho trường hợp không có lựa chọn phù hợp.
- Việc hỏi lại không được hủy hoặc kết thúc nhiệm vụ đang thực hiện: giữ nguyên ngữ cảnh, các thay đổi đã có và các phần độc lập có thể tiếp tục; sau khi người dùng trả lời thì tiếp tục từ điểm đang chờ.
- Với chi tiết nhỏ không ảnh hưởng đáng kể đến kết quả, có thể chọn mặc định hợp lý, ghi rõ giả định và tiếp tục.

## Tương thích nền tảng

Code mới phải phù hợp với Linux và Windows:

- Không dùng API hoặc đường dẫn chỉ có trên macOS nếu không có lý do bắt buộc.
- Dùng API đa nền tảng của Go, Node.js và Electron.
- Không hardcode đường dẫn theo hệ điều hành; dùng API path phù hợp.
- Không đưa logic build/đóng gói macOS vào workflow mặc định.
- Khi có khác biệt nền tảng, cô lập phần khác biệt trong module nhỏ và đặt tên rõ ràng.

## Quy tắc kiến trúc

- Trước khi thêm behavior, đọc cấu trúc hiện tại và tìm abstraction có thể tái sử dụng.
- Dùng đơn vị tổ chức nhỏ nhất vẫn giữ code rõ ràng: code hiện có → function → file/module → package.
- Service và Engine là vai trò trách nhiệm bên trong file/module/package, không phải cấp abstraction lớn hơn package và không bắt buộc phải là class/struct riêng.
- Không tạo Service, Engine, Repository, Manager, Handler, Provider, Adapter hoặc package chỉ để làm code có vẻ "chuẩn".
- Mỗi module/package chỉ nên có một nhóm trách nhiệm và một lý do chính để thay đổi.
- Tách các phần khác trách nhiệm, nhưng liên kết chúng bằng API hoặc dependency direction rõ ràng.
- Không gộp UI, application workflow, infrastructure, storage hoặc processing algorithm vào cùng một module lớn.
- Không tạo `utils`, `common`, `misc` để gom code không có boundary rõ ràng.
- Giữ public API tối thiểu; ưu tiên `internal` khi code chỉ dùng trong project.
- Không tạo abstraction cho yêu cầu tương lai nếu chưa có use case cụ thể.
- Mỗi capability/feature có use case độc lập phải có boundary, input/output và entrypoint rõ ràng để có thể gọi riêng; pipeline hoặc workflow phải được tạo bằng cách ghép các capability/stage độc lập, không khóa toàn bộ behavior vào một flow duy nhất.
- Các stage trong pipeline phải hạn chế state ẩn và coupling không cần thiết, để có thể tái sử dụng, thay thế, sắp xếp lại hoặc kiểm thử độc lập khi contract cho phép.
- Khi tạo feature hoặc behavior mới, phải thiết kế theo input, context và contract thay vì hardcode vào một case, fixture, file, account, provider, model hoặc workflow cụ thể. Không dùng default/sample duy nhất làm giới hạn ngầm cho implementation.
- Phải kiểm tra các case hợp lệ và boundary liên quan, bao gồm input thay đổi, trạng thái rỗng/lỗi, retry hoặc thay đổi thứ tự nếu capability đó hỗ trợ. Nếu tổng quát hóa không khả thi về mặt kỹ thuật, phải ghi rõ lý do, phạm vi giới hạn, invariant bắt buộc và cách fail-closed; boundary vẫn phải đủ rõ để thay thế hoặc mở rộng sau này.

## Phong cách giao diện mặc định

- UI client mặc định theo phong cách Warm Minimal / Beige Minimalism: tối giản, trung tính, yên tĩnh, thân thiện và hơi hướng thủ công; không tạo cảm giác quá công nghệ.
- Dùng palette nền `#F5F1E8`, surface `#FBF9F4`, text `#181716`, secondary `#716D66`, border `#DED9CF` và primary `#1D1C1A`. Chỉ thêm màu trạng thái khi cần truyền đạt trạng thái thật.
- Ưu tiên nhiều khoảng trắng, phân tách bằng border mảnh, card/panel bo góc nhẹ khoảng 8–12px và tránh shadow mạnh.
- Toàn bộ UI dùng chung một sans-serif system stack đa ngôn ngữ, ưu tiên Noto Sans và Segoe UI; không dùng font viết tay hoặc font không bảo đảm glyph tiếng Việt cho logo, tiêu đề, empty state hay nội dung sản phẩm.
- Button chính dùng nền đen và chữ trắng, icon dùng outline nét mảnh, hình ảnh có saturation thấp và animation chỉ nên nhẹ, chậm, không phô trương.

## Chiến lược styling client

- Client dùng Tailwind CSS v4 qua `@tailwindcss/vite`; không chuyển sang CSS thuần hoàn toàn và không thêm framework styling khác.
- Dùng Tailwind utility cho layout đơn giản, flex/grid, spacing, sizing và responsive breakpoint khi utility vẫn dễ đọc.
- Dùng CSS colocated trong `assets/styles/` hoặc folder page/capability cho design token, component/page visual style, pseudo-state, animation, trạng thái phức tạp và quy tắc cần tái sử dụng theo semantic class.
- `assets/main.css` chỉ là composition point; không đặt style trực tiếp của page hoặc component vào file này.
- Không lặp lại utility Tailwind bằng CSS riêng; không dùng chuỗi utility quá dài hoặc khó đọc để thay thế một semantic class có trách nhiệm rõ ràng.
- Không dùng inline style hoặc tạo design-system/utility layer riêng nếu chưa có use case cụ thể.

## Routing skill dự án

Agent phải tự định tuyến skill từ ý định, phạm vi, boundary và rủi ro trong mọi prompt liên quan repository; người dùng không cần ghi tên skill. Trước hành động chính, đối chiếu prompt với `description` và trigger của toàn bộ skill khả dụng, chọn bộ skill nhỏ nhất bao phủ đầy đủ yêu cầu, đọc đầy đủ từng `SKILL.md` được chọn và đánh giá lại routing nếu scope thay đổi trong lúc làm.

Mọi skill dự án phải giữ `policy.allow_implicit_invocation: true` trong `agents/openai.yaml`. Chỉ chuyển skill sang explicit-only khi người dùng yêu cầu rõ; không được chờ người dùng gọi `$skill-name` mới áp dụng skill phù hợp.

`AGENTS.md` và `.agents/skills/` phải được commit cùng nhau như một contract. Không được tham chiếu một project skill trong `AGENTS.md` nếu folder skill tương ứng không tồn tại trong cùng git tree với `SKILL.md`, `agents/openai.yaml` và implicit-invocation policy hợp lệ.

Khi triển khai feature mới hoặc thay đổi behavior không tầm thường:

0. Luôn dùng `feature-workflow` trước khi code để thực hiện preflight, chọn skill chuyên môn và đặt completion gate cho feature.
1. Dùng `change-impact` trước khi sửa behavior dùng chung, signature, API, IPC, schema, config, public export hoặc data flow qua nhiều boundary; trước khi hoàn tất phải rà lại impact map và tìm reference cũ còn sót.
2. Dùng `feature-placement` khi thay đổi có thể thêm hoặc di chuyển function, file/module, package, type, Service hoặc Engine.
3. Dùng `package-boundary` nếu feature làm phát sinh, tách hoặc mở rộng boundary Go package hay TypeScript module/folder.
4. Dùng `service-engine-boundary` nếu feature có application workflow kết hợp repository/storage/provider với processing pipeline.
5. Dùng `infrastructure-boundary` trước khi feature trực tiếp resolve, cấu hình, khởi động hoặc gọi FFmpeg/media runtime, AI runtime/provider, storage hoặc queue dùng chung.
6. Dùng `algorithm-engineering` trước khi triển khai hoặc thay đổi thuật toán không tầm thường, xử lý tính toán nặng, optimization/search, media/ML/parsing kernel, data structure nhạy hiệu năng hoặc processing có yêu cầu rõ về correctness, numerical behavior, determinism, complexity hay tài nguyên.
7. Dùng `concurrency-engineering` trước khi thêm hoặc thay đổi goroutine, channel, lock, atomic, worker pool, task queue, parallel stage, shared mutable state, worker thread, message port hoặc cancellation/ordering qua concurrent work.
8. Dùng `client-server-contract` khi thêm hoặc đổi endpoint, payload, status/error, auth/CORS, timeout hoặc cách client gọi server.
9. Dùng `electron-boundary` khi thay đổi IPC, preload API, filesystem, process, dialog, credential, notification, window behavior hoặc native capability.
10. Dùng `client-ui` khi triển khai hoặc thay đổi UI, layout, interaction hoặc UX trong `promedia-client/`.
11. Dùng `lan-networking` khi thay đổi địa chỉ lắng nghe, LAN IP/hostname, CORS cho mạng nội bộ, firewall/discovery hoặc khi cần kết luận thiết bị khác có thể truy cập Promedia.
12. Dùng `external-runtime` khi feature cần tải thư viện, binary, model, codec hoặc engine ngoài theo nhu cầu và không được đóng vào client.
13. Dùng `build-release` khi build/package/release, thay đổi cấu hình đóng gói, tối ưu kích thước hoặc xác định artifact nào được phát hành.
14. Sau khi code xong, dùng `architecture-audit` cho feature/refactor không tầm thường để kiểm tra abstraction, dependency, boundary và các ảnh hưởng còn bỏ sót.

Với thay đổi nhỏ nằm rõ trong owner hiện có, chỉ dùng skill thật sự liên quan. Không dùng toàn bộ bộ skill cho formatting, documentation-only edit hoặc thay đổi literal cô lập.

### Cổng bắt buộc trước khi sửa code

- Trước edit đầu tiên của một feature, agent phải đọc đầy đủ `feature-workflow` và mọi skill chuyên môn được chọn; không được chỉ dựa vào tên hoặc description của skill.
- Agent phải thông báo ngắn gọn skill nào đang dùng và lý do, sau đó ghi placement/impact note khi skill tương ứng yêu cầu.
- Không bắt đầu code nếu còn thiếu một skill được trigger bởi API, IPC, UI, config, schema, package/module boundary, processing workflow, algorithm constraint hoặc concurrent execution/shared state không tầm thường.
- Trước khi báo hoàn tất, phải tìm reference cũ còn sót, kiểm tra caller/consumer liên quan và chạy verification phù hợp. `computer-use` chỉ là cổng bắt buộc khi thay đổi tạo hoặc sửa luồng UI/E2E; function, package hoặc backend change nhỏ không đổi đường đi UI có thể hoàn tất bằng unit/integration/contract test phù hợp.

## Quy ước đặt tên và file

- Tên biến, hàm, type, interface, package và export trong code phải bằng tiếng Anh.
- Tên file và folder phải ngắn, rõ nghĩa, dễ tìm và có thể mở rộng.
- Tên phải mô tả capability hoặc responsibility, không mô tả tạm thời như `helper`, `misc`, `new`, `temp`.
- Go dùng package name viết thường, không tạo package chỉ vì một file nhỏ.
- Client giữ ranh giới rõ giữa Electron main, preload, renderer và các component UI.
- Không tạo file/component mới nếu trách nhiệm đó vẫn thuộc rõ ràng về file/module hiện có.

## Ngôn ngữ

- Comment trong code phải viết bằng tiếng Việt có dấu và chỉ thêm khi comment giải thích được quyết định hoặc behavior không hiển nhiên.
- Không dùng comment để lặp lại tên hàm hoặc câu lệnh.
- Text hiển thị trên UI, label, validation message và error message cho người dùng phải lấy từ hệ thống i18n; không hardcode text hiển thị trong logic hoặc markup của feature.
- Mỗi thay đổi có text hiển thị phải cập nhật đồng thời đủ hai locale tiếng Việt (`vi`) và tiếng Anh (`en`), với bộ key tương ứng và nội dung tự nhiên theo từng ngôn ngữ.
- Mỗi locale phải nằm trong file riêng bên trong folder locale của capability i18n; không gộp nhiều bộ ngôn ngữ vào một dictionary hoặc file page.
- Log kỹ thuật có thể dùng tiếng Anh nếu cần cho việc tìm kiếm và vận hành.
- Không trộn text kỹ thuật tiếng Anh vào UI nếu không có lý do sản phẩm.

## i18n và cài đặt ngôn ngữ

- Client phải hỗ trợ chuyển đổi giữa tiếng Việt và tiếng Anh từ mục Cài đặt.
- Locale người dùng chọn phải được lưu trong cấu hình người dùng hoặc storage phù hợp để được giữ lại sau khi khởi động lại ứng dụng.
- Khi thêm màn hình hoặc luồng mới, phải cung cấp đầy đủ bản dịch cho cả hai locale trước khi coi feature hoàn tất; không dùng text tạm, key bị thiếu hoặc chỉ dịch một ngôn ngữ.
- Hệ thống i18n phải có fallback xác định (ưu tiên locale hiện tại, sau đó tiếng Anh) và không để key i18n thô xuất hiện trong UI.

## Client và server

- API contract giữa `server/` và `promedia-client/` phải rõ ràng, ổn định và cấu hình được.
- Không hardcode địa chỉ server trong nhiều nơi; dùng environment/configuration.
- Client không truy cập trực tiếp database hoặc infrastructure của server.
- Server giữ business logic dùng chung và infrastructure ở phía backend; local media workflow và vòng đời tiến trình đặc quyền thuộc Electron Main, còn renderer chỉ xử lý UI state và gọi API qua boundary.
- Các phần Electron main/preload/renderer phải giao tiếp qua boundary rõ ràng, không bật quyền Node.js không cần thiết trong renderer.

## Infrastructure boundary

- FFmpeg/FFprobe và media runtime, AI runtime/provider, storage/database client cùng queue/broker phải có lifecycle owner rõ trước khi feature đầu tiên tích hợp; không chờ đến khi nhiều feature đã gọi riêng mới tách.
- Owner giữ source of truth cho config, executable/endpoint, credential reference, connection/process lifecycle, health/probe, transport timeout/retry và cleanup. Feature giữ use case, domain validation, processing plan/job payload, business retry/idempotency và result mapping.
- Feature không tự resolve/download/probe/spawn FFmpeg bằng private path, không tự tạo AI SDK/model client hoặc đọc credential, không tự mở storage/database connection và không hardcode queue topic/stream hay polling loop.
- Electron Main sở hữu device runtime và process lifecycle. Server composition sở hữu AI provider/runtime, storage implementation và queue transport. Renderer, handler, Service và Engine chỉ tiêu thụ capability/port hẹp phù hợp boundary.
- Shared owner không được trở thành service locator hoặc một `Manager` gom FFmpeg, AI, storage và queue. Mỗi infrastructure surface giữ API và lifecycle riêng khi trách nhiệm khác nhau.
- Composition root nối concrete infrastructure vào consumer; feature package/module không import deployment detail. Khi thay owner hoặc contract dùng chung, phải dùng `change-impact` để rà mọi caller cũ.

## Vị trí xử lý media và AI

- Mặc định xử lý media không dùng AI chạy trên thiết bị: probe, thumbnail, waveform, cắt/ghép, crop/resize, chuyển mã/nén, âm thanh, subtitle, watermark và scene detection thông thường.
- Mặc định AI/model nặng, provider cần credential, durable job, shared storage và batch cần tiếp tục khi client tắt chạy trên server.
- Luồng hybrid phải để server trả transcript, timestamp, vùng, timeline hoặc processing plan có cấu trúc; client áp dụng kết quả lên media gốc bằng engine local khi có thể.
- Không tải media gốc lên server chỉ để thực hiện thao tác local. Khi AI cần nội dung, chỉ gửi audio/frame/chunk/proxy tối thiểu theo contract và phải có consent, size limit, retention cùng cleanup rõ ràng.
- Feature media local không phụ thuộc server chỉ để forward lệnh engine và nên tiếp tục hoạt động khi server mất kết nối, trừ authorization/business rule đã được xác định rõ trong yêu cầu sản phẩm.
- Chỉ chuyển media processing thông thường lên server khi media đã ở server, cần collaboration/reproducibility tập trung, batch nền, tài nguyên server hoặc người dùng chủ động chọn server processing.

## LAN và thư viện/engine ngoài

- Cấu hình LAN phải dùng environment hoặc URL do người dùng nhập; không hardcode IP hiện tại, không tự quét subnet và không tự sửa firewall nếu chưa có yêu cầu rõ ràng.
- Chỉ lưu URL server do người dùng nhập sau khi endpoint Promedia thật đã phản hồi hợp lệ. Phải phân biệt kiểm tra loopback, LAN IP cùng máy và thiết bị vật lý khác khi báo cáo.
- Thư viện, binary, model, codec và engine lớn/tùy chọn không được đặt trong source client, `out`, ASAR hoặc packaged resources. Cài chúng vào thư mục user-data do ứng dụng quản lý trên Windows/Linux.
- Model, AI runtime và server engine lớn không được nhúng vào Go binary hoặc client catalog; đặt chúng dưới server data directory/volume cấu hình được với lifecycle owner riêng.
- Nút tải engine nằm tại feature cần engine và chỉ hiện khi runtime thiếu hoặc không còn hợp lệ. Sau khi tải và xác minh thành công phải ẩn; nếu người dùng xóa/hỏng runtime thì lần kiểm tra tiếp theo phải hiện lại.
- Mọi metadata runtime phải lấy động từ catalog đã validate; skill, UI và lifecycle dùng chung không được hardcode tên feature/engine, phiên bản, dung lượng, URL, checksum, đường dẫn cài hoặc tên file theo nền tảng.
- Client phải có route Thư viện gần Cài đặt để hiển thị trạng thái đã kiểm tra và cài/sửa runtime từ cùng lifecycle với CTA tại feature. Feature phải kiểm tra lúc mở, hiển thị đầy đủ version/dung lượng/nơi xử lý/quyền riêng tư/các phase, tự mở giao diện feature sau khi cài và kiểm tra lại ngay trước khi chạy.
- Không tải hoặc thực thi artifact khi chưa có version, nguồn HTTPS được phép, SHA-256, kích thước, license và platform/architecture rõ ràng.

## Dữ liệu và kiểm thử thực tế

- Feature phải được kiểm tra bằng dữ liệu thật hoặc nguồn dữ liệu thật trong phạm vi có thể: server đang chạy, database, file, API hoặc payload thực tế.
- Không dùng mockup data trong UI hoặc dữ liệu giả đơn giản để kết luận feature đã hoạt động đúng.
- Không hardcode business data, user data, API payload, địa chỉ kết nối hoặc cấu hình thay đổi thường xuyên trong code.
- Dữ liệu có thể thay đổi phải được đưa ra environment, config, database, request input hoặc fixture/seed file có cấu trúc rõ ràng.
- Fixture và seed dùng cho test phải mô phỏng đúng format dữ liệu thật, được quản lý riêng ngoài logic xử lý và dễ thay thế.
- Không đưa secret, token, dữ liệu cá nhân hoặc dữ liệu production nhạy cảm vào source code, fixture công khai hoặc log.
- Khi không thể dùng dữ liệu thật vì lý do bảo mật hoặc môi trường, phải dùng dữ liệu đã ẩn danh nhưng giữ nguyên cấu trúc và đặc tính cần kiểm tra, đồng thời ghi rõ giới hạn kiểm thử.
- Test phải kiểm tra đường đi dữ liệu thực tế giữa các boundary, không chỉ kiểm tra một hàm với giá trị tự tạo trong code.

## Kiểm thử E2E/UI bằng giao diện

- Bắt buộc dùng `computer-use` cho thay đổi tạo hoặc sửa luồng người dùng/E2E: page, interaction, client workflow, IPC/native capability được kích hoạt từ UI, kết nối client-server hiển thị cho người dùng hoặc behavior của packaged app.
- Với luồng thuộc diện bắt buộc, phải thao tác trên đường đi sản phẩm thật: mở màn hình, click/nhập liệu, kích hoạt chức năng, chờ kết quả và kiểm tra loading/validation/error/empty/success liên quan. Báo `PASS`, `FAIL`, `BLOCKED` hoặc `NOT RUN` theo bằng chứng thực tế.
- Function, module/package, algorithm core, config loader, repository, handler hoặc backend change nhỏ không tạo/đổi UI/E2E flow không bắt buộc `computer-use`; unit, integration, API hoặc contract test phù hợp có thể là bằng chứng nghiệm thu chính.
- Không tạo UI giả hoặc mở rộng scope chỉ để có đường click-through cho một thay đổi backend/package độc lập. Trong báo cáo có trường computer-use, ghi `NOT REQUIRED` và lý do ngắn.
- Khi backend/API/IPC thay đổi behavior mà một UI flow thực tế đang sử dụng, phải kiểm tra integration/contract trước và chạy `computer-use` cho chính flow bị ảnh hưởng.
- `computer-use` hiện cung cấp bằng chứng UI trên Windows; khi thay đổi có hành vi UI riêng trên Linux, phải bổ sung kiểm tra phù hợp và nêu rõ target đã xác minh.

## Kiểm tra thay đổi

- Không build nếu chưa được yêu cầu theo quy tắc ở trên.
- Khi cần xác minh mà không build, ưu tiên test, typecheck, lint hoặc kiểm tra tĩnh có phạm vi nhỏ.
- Sau mỗi feature hoặc behavior change, mặc định chạy `node verify-base.mjs` ở repository root để kiểm tra đồng thời server và client. Các stage `server` hoặc `client` có thể chạy riêng để chẩn đoán, nhưng không thay thế cổng toàn base trước khi hoàn tất.
- Khi thay đổi tạo hoặc sửa luồng UI/E2E, phải khởi động server/client cần thiết và xác minh flow bị ảnh hưởng bằng `computer-use`; không vô hiệu hóa route, capability hoặc component không liên quan chỉ để flow mới chạy.
- Với function/package/backend change nhỏ không đổi UI/E2E, chạy unit/integration/API/contract test theo boundary và không coi việc không dùng `computer-use` là thiếu bằng chứng.
- Khi người dùng yêu cầu build, chạy đúng target Linux và Windows, sau đó báo cáo lỗi theo từng target.
- Không sửa hoặc dọn dẹp code ngoài phạm vi feature nếu không cần cho correctness, maintainability hoặc yêu cầu trực tiếp.
