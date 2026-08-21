---
name: client-ui
description: Define and implement clear, consistent UI for the Promedia Electron renderer while preserving its existing rendering pattern, data boundaries, accessibility, and Linux/Windows behavior. Use when creating or changing client UI, layout, interaction, or UX.
---

# Client UI

## Mục tiêu

Giữ UI nhất quán mà không tạo component, framework hoặc design-system abstraction sớm hơn nhu cầu thật.

## Kiểm tra kiến trúc renderer hiện tại

- Đọc `promedia-client/package.json`, entrypoint renderer và các component gần feature trước khi thiết kế.
- Kiểm tra thư mục `promedia-client/src/renderer/src/pages` và page gần nhất trước khi thêm hoặc đổi một page-level feature.
- Client hiện dùng TypeScript module và HTML string; tiếp tục pattern hiện có trừ khi người dùng yêu cầu hoặc feature chứng minh cần thay đổi kiến trúc.
- Không tự thêm React, Vue, Svelte, component library hoặc state library cho một màn hình riêng lẻ.
- Giữ renderer, preload và Electron main đúng boundary; UI cần quyền Node/Electron phải đi qua API preload hẹp theo `electron-boundary`.

## Tổ chức theo page và feature

- Mỗi page hoặc capability cấp màn hình phải có một folder riêng dưới `src/renderer/src/pages/`, đặt tên theo capability, ví dụ `pages/settings/` và `pages/edit-video/`.
- Page entry module chịu trách nhiệm compose layout của page, nhận state từ renderer controller và nối các module chức năng của page.
- Mỗi chức năng có layout, state hoặc interaction riêng phải nằm trong một file/module riêng bên trong folder page, ví dụ `page.ts`, `media-panel.ts`, `preview.ts`, `properties-panel.ts` hoặc `timeline.ts` trong `pages/edit-video/`.
- Route dispatcher, `main.ts` hoặc module dùng chung chỉ chọn page và lắp shell; không chứa toàn bộ markup, state hoặc workflow của một page cụ thể.
- Không dồn nhiều chức năng của một page vào `components/content.ts`, `components/header.ts`, `components/sidebar.ts` hoặc một file dùng chung tương tự.
- Khi repository chưa có `pages/`, tạo boundary folder này cho page-level feature thay vì mở rộng một file component dùng chung.

## Component và khả năng tái sử dụng

- Trước khi tạo UI mới, kiểm tra `promedia-client/src/renderer/src/components` và các page/module liên quan.
- Component dùng chung là mẫu cấu trúc, thuộc tính, style và semantics để các page tái sử dụng; component nhận data/state qua input rõ ràng và không sở hữu workflow của page.
- Dùng hoặc mở rộng component hiện có khi nó cùng trách nhiệm và cùng semantics.
- UI chỉ dùng tại một màn hình phải nằm trong folder page đó, không đưa vào component dùng chung chỉ để giảm số dòng.
- Chỉ trích xuất component dùng chung khi có nhiều caller thật hoặc một pattern dùng chung ổn định đã rõ.
- Component dùng chung không chứa business data, route condition hoặc markup đầy đủ của một page cụ thể.
- Không tạo wrapper chỉ để rút ngắn chuỗi class hoặc đổi tên một element.

## Design pattern

- Dùng thống nhất pattern hiện có cho màu sắc, spacing, typography, border, shadow, focus và trạng thái.
- Đưa giá trị lặp lại thành token/variant khi repetition đại diện cho cùng một semantics, không chỉ vì chuỗi class giống nhau.
- Không tạo một hệ thống token riêng nếu Tailwind và pattern hiện tại đã đủ.

## Chiến lược Tailwind và CSS

- Client bắt buộc giữ Tailwind CSS v4 qua `@tailwindcss/vite` và `@import "tailwindcss"`; không thay bằng CSS thuần hoàn toàn hoặc framework styling khác.
- Dùng Tailwind utility cho layout đơn giản, flex/grid, spacing, sizing và responsive breakpoint khi chuỗi class vẫn dễ đọc.
- Dùng stylesheet colocated cho token/theme, kiểu hiển thị của page/capability, pseudo-state, animation, trạng thái phức tạp và các quy tắc được dùng qua semantic class.
- `assets/main.css` chỉ import Tailwind và các stylesheet cấp ứng dụng/page; không chứa style triển khai của mọi page.
- Không sao chép utility Tailwind thành CSS riêng. Ngược lại, không dùng chuỗi utility dài, lặp lại hoặc khó đọc để né một semantic class có trách nhiệm rõ ràng.
- Không dùng inline style hoặc thêm design system/utility layer riêng nếu chưa có use case cụ thể.

## Tổ chức stylesheet

- `assets/main.css` chỉ nên là composition point cho Tailwind và các stylesheet cấp ứng dụng; không dồn style của mọi page vào một file lớn.
- Token/theme và app shell dùng chung nằm trong `assets/styles/`. Style chỉ thuộc một page phải đặt cạnh page đó, ví dụ `pages/settings/page.css`.
- Khi page có capability module riêng, style chỉ dùng cho capability đó nên dùng cùng basename, ví dụ `language.ts` đi cùng `language.css`; `page.css` chỉ giữ layout/composition và style thật sự dùng chung trong page.
- Chỉ đưa style thành shared component khi có nhiều consumer thật và cùng semantics; tên class phải mô tả vai trò, không mô tả màu hoặc vị trí tạm thời.

## Warm Minimal / Beige Minimalism

- Phong cách mặc định của Promedia là tối giản, trung tính, yên tĩnh và hơi hướng thủ công; giữ nhiều khoảng trắng và tránh cảm giác giao diện công nghệ phô trương.
- Ưu tiên các token màu: background `#F5F1E8`, surface `#FBF9F4`, text `#181716`, secondary `#716D66`, border `#DED9CF`, primary `#1D1C1A`.
- Phân tách card/panel bằng border mảnh, bo góc khoảng 8–12px và không dùng shadow mạnh. Button chính là nền đen với chữ trắng; icon dùng outline nét mảnh.
- Toàn bộ UI dùng token `--font-ui` với sans-serif system stack đa ngôn ngữ, ưu tiên Noto Sans và Segoe UI. Không dùng font viết tay hoặc font thiếu glyph tiếng Việt cho logo, tiêu đề, empty state hay nội dung sản phẩm.
- Animation chỉ nên nhẹ và chậm: hover đổi nền, fade hoặc scale rất nhỏ. Hình ảnh nếu có nên ít saturation và hòa với beige, xám, đen.
- Giữ fallback font offline và đa nền tảng; không phụ thuộc tải font qua mạng và không thêm dependency font chỉ cho một màn hình.

## i18n và lựa chọn ngôn ngữ

- Trước khi thêm text UI, kiểm tra cơ chế i18n và locale hiện có; dùng lại cơ chế đó thay vì tạo dictionary hoặc translator riêng cho từng page.
- Tổ chức source i18n theo capability: module index/loader giữ logic locale, còn từng bộ ngôn ngữ nằm trong file riêng dưới folder `locales/` (ví dụ `locales/vi.ts` và `locales/en.ts`); không gộp nhiều locale vào một file.
- Mọi text hiển thị, label, validation message, empty state, loading state và error message phải dùng key i18n, không hardcode trực tiếp trong HTML string hoặc logic render.
- Mỗi key mới phải có bản dịch đồng thời trong cả tiếng Việt (`vi`) và tiếng Anh (`en`), giữ cùng bộ key và placeholder; không dùng bản dịch tạm hoặc để thiếu locale.
- Mục Cài đặt phải là nơi người dùng chọn locale. Lựa chọn phải được lưu qua lần khởi động sau và state/render hiện tại phải được cập nhật nhất quán khi locale thay đổi.
- Khi locale hoặc key không tồn tại, dùng fallback đã định nghĩa, ưu tiên tiếng Anh, và không hiển thị key kỹ thuật cho người dùng.

## Render dữ liệu an toàn

- Không nội suy dữ liệu từ server, file hoặc người dùng vào `innerHTML` mà chưa escape đúng ngữ cảnh.
- Ưu tiên `textContent`, DOM API hoặc một hàm escape tập trung cho text động. URL và attribute động cần validation riêng.
- HTML string chỉ nên chứa markup tĩnh hoặc dữ liệu đã được xử lý an toàn.
- Không dùng dữ liệu mockup để kết luận UI đã hoạt động.

## State và vòng đời interaction

- Luồng bất đồng bộ phải có các trạng thái phù hợp: loading, empty, error, success và disabled.
- Không để vùng nội dung trống khi đang tải, không có dữ liệu hoặc lỗi.
- Global event listener chỉ đăng ký một lần; listener theo view phải được teardown hoặc gắn với DOM lifecycle rõ ràng.
- Hủy request hoặc bỏ qua kết quả stale khi route/view đã đổi.
- Khi render lại bằng `innerHTML`, kiểm tra lại event binding, focus, selection và trạng thái đang thao tác.

## Accessibility và feedback

- Ưu tiên semantic HTML, label rõ ràng và keyboard interaction đúng loại control.
- Focus state phải nhìn thấy được; tab order phải hợp lý.
- Dùng ARIA khi semantic HTML chưa đủ, không dùng ARIA thay thế HTML phù hợp.
- Không truyền đạt trạng thái chỉ bằng màu sắc.
- Dùng inline message cho lỗi form, toast cho kết quả không chặn luồng, modal cho xác nhận hoặc hành động có rủi ro khi các pattern đó đã tồn tại hoặc thực sự cần.
- Feedback phải nói rõ chuyện gì xảy ra và người dùng có thể làm gì tiếp theo.
- Text UI và message cho người dùng phải đi qua i18n; bản tiếng Việt dùng chính tả có dấu và bản tiếng Anh dùng cách diễn đạt tự nhiên.

## Data boundary

- Page module nhận data/state và compose markup của page; module chức năng trong page chỉ sở hữu phần UI/interaction thuộc capability đó.
- Module trình bày không tự sở hữu business workflow; route controller hoặc renderer application module điều phối API, state và interaction liên page.
- Thao tác cần filesystem, process, credential hoặc Electron API phải qua preload/main; không đưa quyền Node vào renderer.
- Khi API contract thay đổi, dùng `client-server-contract` và cập nhật runtime validation/error mapping tương ứng.

## Responsive Electron UI

- Đọc cấu hình `BrowserWindow` hiện tại để chọn kích thước kiểm tra thay vì hardcode giả định trong skill.
- Kiểm tra layout tại kích thước tối thiểu và kích thước mặc định trên Linux/Windows.
- Không để text, button, dialog hoặc nội dung chính tràn hay bị cắt ngoài viewport.
- App shell là owner duy nhất của chiều cao viewport. Page nằm trong shell không được tự dùng `100vh`, `min-h-screen` hoặc phép `calc()` cộng thêm header/padding làm xuất hiện window-level scrollbar.
- Giữ `min-height: 0` trên các flex child cần co lại; nếu nội dung dài, scroll phải nằm trong vùng content được chỉ định, không làm toàn bộ cửa sổ vượt khỏi khuôn Electron.
- Xác minh không có scrollbar dư ở cả kích thước mặc định và kích thước tối thiểu của `BrowserWindow`.

## Verification

Kiểm tra bằng dữ liệu hoặc payload có cấu trúc thật trong phạm vi có thể. Xác minh keyboard, focus, loading/error/empty state và layout rộng/hẹp. Nếu không thể render/quan sát UI thực tế, nêu rõ phần chưa được xác minh; không suy ra visual correctness chỉ từ source code.

Với page-level feature, kiểm tra thêm route chỉ trỏ tới page entry tương ứng, các chức năng page không còn nằm trong module dùng chung, và các component dùng chung không chứa route condition hoặc business data của page.
