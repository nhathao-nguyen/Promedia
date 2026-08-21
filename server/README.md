# Go server

HTTP server của Promedia viết bằng Go.

## Cấu hình

Tạo file cấu hình local từ mẫu:

```bash
cp .env.example .env
```

Server tự đọc `.env` trong thư mục làm việc. Biến môi trường của process được ưu tiên hơn giá trị trong file. Có thể đặt `PROMEDIA_ENV_FILE` để dùng một file cấu hình khác.

Các biến bắt buộc:

- `HTTP_ADDR`: địa chỉ lắng nghe; dùng `0.0.0.0:8080` để nhận kết nối IPv4 trong LAN.
- `CORS_ALLOWED_ORIGINS`: danh sách origin HTTP/HTTPS chính xác, phân tách bằng dấu phẩy. Wildcard `*` bị từ chối.
- `HTTP_READ_TIMEOUT`: thời gian tối đa đọc request.
- `HTTP_WRITE_TIMEOUT`: thời gian tối đa ghi response.
- `HTTP_IDLE_TIMEOUT`: thời gian giữ kết nối nhàn rỗi.
- `SHUTDOWN_TIMEOUT`: thời gian chờ server dừng an toàn.

## Chạy local

```bash
go run ./cmd/server
```

Với `.env.example`, server lắng nghe mọi interface IPv4 ở cổng `8080`; cùng máy vẫn truy cập bằng `http://localhost:8080`.

## Chạy trong LAN

1. Giữ `HTTP_ADDR=0.0.0.0:8080` hoặc chọn một interface LAN cụ thể.
2. Tìm IPv4 của máy chạy server (`Get-NetIPAddress -AddressFamily IPv4` trên Windows hoặc `hostname -I` trên Linux).
3. Nếu hệ điều hành đang chặn inbound, quản trị viên chỉ mở TCP port `8080` cho private/trusted network. Server không tự thay đổi firewall.
4. Trên client, vào `Cài đặt`, nhập `http://<LAN-IP>:8080`, rồi chọn `Lưu và kiểm tra`.

`CORS_ALLOWED_ORIGINS` chỉ cần liệt kê các browser origin thật sự gọi API, ví dụ `http://localhost:5173`. Electron main gọi server qua boundary riêng và không cần thêm wildcard. CORS không thay thế authentication cho endpoint nhạy cảm.

## API hiện có

- `GET /healthz` — kiểm tra server đang hoạt động.

Client Electron kiểm tra kết nối bằng endpoint này. Chỉ một URL trả đúng payload Promedia mới được client lưu lại.

## Kiểm tra và build

```bash
make test
make verify
make build-linux
make build-windows
```

`TARGET_ARCH` mặc định là `amd64` và có thể ghi đè khi gọi `make`. Dự án không có target build macOS.

## Cấu trúc hiện tại

- `cmd/server` — entrypoint của ứng dụng.
- `internal/config` — đọc và kiểm tra cấu hình runtime.
- `internal/handler` — HTTP handlers và route.
- `internal/server` — HTTP server, CORS và graceful shutdown.
