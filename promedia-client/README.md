# Promedia

Ứng dụng desktop dùng Electron, Vite, TypeScript và Tailwind CSS.

## Cấu hình kết nối tùy chọn

Tạo file cấu hình local từ mẫu:

```bash
cp .env.example .env
```

Hai biến sau chỉ là mặc định cho môi trường phát triển, không bắt buộc trong bản đóng gói:

- `VITE_API_URL`: địa chỉ gốc ban đầu của Go server. Nếu bỏ trống, người dùng nhập địa chỉ local/LAN tại Cài đặt.
- `VITE_API_TIMEOUT_MS`: thời gian tối đa chờ kiểm tra kết nối; mặc định 5000 ms nếu bỏ trống hoặc không hợp lệ.

## Chạy trong môi trường phát triển

```bash
npm install
npm run dev
```

## Kiểm tra và đóng gói

```bash
npm run typecheck
npm run verify
npm run dependency:audit
npm run build
npm run dist:linux
npm run dist:windows
```

Dự án chỉ hỗ trợ target Linux và Windows; không cấu hình đóng gói macOS.

## Cấu trúc hiện tại

- `src/main` — Electron main process và cửa sổ ứng dụng.
- `src/preload` — bridge capability hẹp giữa renderer sandbox và main process.
- `src/shared` — type/channel contract dùng chung giữa main, preload và renderer.
- `src/renderer` — renderer chạy trong sandbox, không có quyền Node.js.
- `src/renderer/src/i18n` — locale state và hai bộ ngôn ngữ `vi`/`en` tách riêng.
- `src/renderer/src/pages` — page và capability UI nằm cạnh markup, interaction và style riêng.
- `src/renderer/src/assets/styles` — theme token và app shell dùng chung.
- `src/renderer/src/server` — cấu hình và consumer của contract kết nối server.
- `src/renderer/src/routes.ts` — route và nhãn điều hướng hiện có.
- `src/renderer/src/components` — các thành phần giao diện.

Renderer không có quyền Node.js và không nhận raw IPC. Health check và runtime lifecycle được thực thi ở main process qua preload API hẹp, có validation và cancellation.

## Kết nối backend

Trong trang `Cài đặt`, client tự động gọi `GET /healthz` bằng URL đã lưu hoặc URL mặc định từ `.env`. Response hợp lệ phải có HTTP status thành công, content type JSON và payload `{ "status": "ok" }`. Địa chỉ người dùng nhập chỉ được lưu sau khi kiểm tra thành công, nên có thể dùng `http://<LAN-IP>:8080`; giá trị đã lưu được giữ sau khi khởi động lại.

## Dependency và engine ngoài

`npm run verify` chạy typecheck, test client và policy dependency từ lockfile. `npm run dependency:audit` chạy audit registry riêng khi có mạng. `electron-builder` được pin chính xác ở bản ổn định hiện tại; bốn deprecation gián tiếp đã biết được khóa theo đường dẫn/version trong `dependency-policy.json`, và policy sẽ fail nếu cây dependency phát sinh hoặc thay đổi cảnh báo chưa được review.

Các dependency này chỉ là công cụ phát triển; cấu hình đóng gói chỉ lấy `out/**/*`. Binary, model, codec và engine tùy chọn được cài theo nhu cầu dưới `<userData>/runtimes`, không đưa vào source, `out`, ASAR hoặc packaged resources.

Tab `Thư viện` đọc catalog runtime, kiểm tra file/marker/hash/probe thực tế và hiển thị tên chức năng, component, phiên bản, dung lượng, nơi xử lý, quyền riêng tư và giấy phép. Phiên bản/dung lượng/URL/checksum được main process giải quyết động từ nguồn allowlist. Luồng cài đặt có tải, kiểm tra SHA-256, kiểm tra archive traversal/link, giải nén tạm, probe và chuyển thư mục nguyên tử; chỉ marker đã cài được ghi cuối cùng. Quy trình chung bắt buộc nằm trong skill `external-runtime`.

## Routing

Client dùng hash routing để không tải lại trang khi đổi màn hình:

- `#/dashboard`
- `#/libraries`
- `#/settings`
