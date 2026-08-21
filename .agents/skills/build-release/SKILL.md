---
name: build-release
description: Build, package, size, inspect, or release Promedia client and server artifacts for Windows and Linux. Use for installer or single-file delivery requests, Electron packaging changes, locale pruning, artifact-size investigations, and release acceptance; do not use for ordinary code verification when no build was requested.
---

# Build and Release

Produce reviewable Promedia artifacts without bundling external runtimes, confusing staging output with deliverables, or claiming targets that were not executed.

## Authorization and targets

- Chỉ chạy build/package khi người dùng yêu cầu rõ. Yêu cầu phân tích cấu hình hoặc sửa code thông thường không cấp quyền chạy build.
- Khi đã được yêu cầu build Promedia, build và báo cáo riêng Windows cùng Linux; không thêm macOS.
- Ghi rõ OS, architecture, command, artifact, kích thước, trạng thái launch/acceptance và target chưa thể chạy. Cross-compile thành công không chứng minh binary đã chạy trên OS đích.

## Release model

Client artifact chỉ chứa Electron app shell và code đã compile. Không chứa FFmpeg/FFprobe, downloader, Python environment, model, codec hoặc optional engine; dùng `external-runtime` cho lifecycle của chúng.

Windows phát hành cho người dùng một installer `.exe` theo cấu hình sản phẩm. Phân biệt:

- installer `.exe`: artifact người dùng tải;
- `win-unpacked`: staging/debug nội bộ, không phát hành;
- `builder-debug.yml` và log: bằng chứng nội bộ, không phát hành;
- `.blockmap`/update metadata: chỉ đưa lên update infrastructure khi updater thật sự sử dụng, không đưa như file người dùng cần tải.

Một installer tải về là một file không có nghĩa ứng dụng Electron chỉ còn một file sau khi cài. Electron/Chromium phải được cài hoặc giải nén thành executable, DLL và resources. Chỉ dùng target portable khi người dùng yêu cầu hành vi portable và đã chấp nhận extraction/runtime semantics; không mô tả portable Electron như binary không bao giờ bung file.

Linux giữ artifact theo target đã cấu hình, ví dụ AppImage hoặc DEB. Không gộp artifact Linux vào gói Windows hoặc tạo macOS output.

## Client configuration and package size

- Bản client phát hành chung không hardcode IP LAN. `VITE_API_URL` và timeout chỉ là build-time default tùy chọn; người dùng chọn URL local/LAN ở runtime và app chỉ lưu endpoint đã handshake thành công.
- Không yêu cầu người dùng đặt file `.env` cạnh client installer/executable. Cấu hình người dùng thuộc Electron user data hoặc storage owner hiện có.
- Giới hạn Electron locale trong package theo locale sản phẩm đang hỗ trợ, hiện là `vi` và `en-US`; không xóa locale cần cho UI thật.
- Dùng package allowlist tối thiểu. Kiểm tra ASAR và packaged resources thật thay vì suy ra từ `package.json`; development dependencies trong lockfile không tự chứng minh chúng đã vào artifact.
- Không xóa Electron executable, Chromium resources, DLL hoặc license bắt buộc để làm gói nhỏ giả tạo. Nếu kích thước Electron vẫn không đáp ứng constraint sản phẩm sau khi loại runtime/locale/file thừa, báo trade-off framework thay vì hứa tối ưu không thực tế.

## Server artifact and configuration

- Server phát hành riêng theo OS/architecture; không nhét server executable vào client installer.
- Server config là runtime input qua environment hoặc file config được chọn rõ. Phát hành template/schema không chứa secret; không bake LAN IP, credential, database URL, provider key hoặc model path theo một máy vào binary.
- Model, AI runtime, codec lớn và server engine nằm ngoài Go binary dưới data directory/volume cấu hình được. Server package chỉ chứa binary và tài liệu/template vận hành thực sự cần cho deployment.
- Khi phát hành server cho LAN, bind address, port, allowed origins, auth và firewall guidance vẫn thuộc `lan-networking`/`client-server-contract`; build pass không chứng minh physical LAN.

## Pre-build gate

1. Xác nhận branch/commit và working tree thực tế; không đóng gói nhầm source cũ hoặc artifact cũ.
2. Chạy `node verify-base.mjs`, targeted checks và dependency policy/audit phù hợp trước package. Không gọi compile pass là release pass.
3. Kiểm tra config packaging chỉ lấy source cần thiết và loại external runtime, model, fixture/output, secret cùng development artifact.
4. Nếu build nhằm xác minh feature, feature phải qua completion gate và architecture audit tương ứng trước khi coi artifact là release candidate.

## Post-build acceptance

1. Liệt kê artifact thật theo target, architecture, hash và byte size; tách published deliverable khỏi staging/update metadata.
2. Inspect packaged file list/ASAR để chứng minh runtime/model/server binary không bị nhét vào client và locale ngoài phạm vi không còn trong deliverable.
3. Cài/chạy Windows artifact thực bằng `computer-use`; kiểm tra khởi động, Settings/Libraries và luồng feature liên quan. Báo `BLOCKED`/`NOT RUN` nếu không thể thao tác UI.
4. Với runtime on-demand, kiểm tra consent, progress/cancel, verify/install, restart/offline, xóa runtime và cài lại bằng artifact đã đóng gói khi scope release liên quan.
5. Khởi động server artifact trên OS có thể chạy, dùng config ngoài binary và kiểm tra health/contract thật. Build Linux trên Windows chỉ là build evidence cho tới khi chạy trên Linux.
6. Chỉ báo `LAN PHYSICAL PASS` khi một thiết bị vật lý khác kết nối và server quan sát được traffic; cùng máy hoặc LAN IP cùng máy phải báo đúng mức bằng chứng.

## Report

Báo riêng `verify`, `build`, `package inspection`, `launch/UI`, `server runtime`, `LAN` và từng OS target bằng `PASS`, `FAIL`, `BLOCKED` hoặc `NOT RUN`. Không coi thư mục staging, file tồn tại hoặc artifact build cũ là bằng chứng bản hiện tại hoạt động.
