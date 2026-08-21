# Promedia

Promedia là monorepo chứa backend và desktop client của cùng một sản phẩm.

## Thành phần

- `server/`: backend viết bằng Go.
- `promedia-client/`: desktop client dùng Electron, Vite, TypeScript và Tailwind CSS.

Server có cấu hình lắng nghe LAN và client cho phép lưu địa chỉ server/IP đã xác minh tại trang Cài đặt. Hướng dẫn firewall, mức bằng chứng LAN và giới hạn bảo mật nằm trong `server/README.md`.

Hướng dẫn cài đặt và chạy từng thành phần nằm trong file `README.md` của thư mục tương ứng.

## Kiểm tra toàn base

Sau mỗi feature hoặc behavior change, chạy cổng mặc định từ repository root:

```bash
node verify-base.mjs
```

Pipeline này chạy test server và typecheck client mà không build/đóng gói. Có thể truyền `server` hoặc `client` để chẩn đoán một stage riêng, nhưng cổng hoàn tất mặc định luôn chạy cả hai.

## Agent skills

Instruction và skill dùng chung cho Promedia nằm trong [AGENTS.md](AGENTS.md) và [.agents/skills](.agents/skills/). Để phân phối cho máy khác, giữ cả hai thành phần này trong cùng checkout. Cách xác thực skill được ghi trong [.agents/README.md](.agents/README.md).
