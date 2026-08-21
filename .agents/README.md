# Promedia agent skills

Các skill riêng của Promedia nằm trong `.agents/skills/`. File `AGENTS.md` ở thư mục gốc là instruction đi kèm và cần được phân phối cùng bộ skill.

## Sử dụng trên máy khác

Đặt cả `AGENTS.md` và `.agents/skills/` vào git checkout của Promedia. Codex sẽ tự tìm skill theo thư mục `.agents/skills/` khi làm việc trong repository.

## Tự động định tuyến

Mỗi skill giữ `policy.allow_implicit_invocation: true` trong `agents/openai.yaml`. Agent phải nhận diện skill từ intent và boundary của prompt dựa trên `description` trong `SKILL.md`; người dùng không cần gọi `$skill-name`. `feature-workflow` là router bắt buộc cho feature hoặc behavior change không tầm thường và sẽ chọn thêm các skill chuyên môn thật sự được trigger. `infrastructure-boundary` bảo vệ owner dùng chung của FFmpeg, AI runtime, storage và queue; `lan-networking` giữ contract và mức bằng chứng LAN; `external-runtime` giữ runtime bên ngoài client/server binary; `build-release` giữ cấu trúc artifact, kích thước và cổng phát hành Windows/Linux.

`AGENTS.md` và toàn bộ `.agents/skills/` là một contract phân phối duy nhất: không commit hoặc push một tham chiếu skill trong `AGENTS.md` nếu folder skill tương ứng không nằm trong cùng git tree. Trước khi đẩy, phải kiểm tra mọi skill có `SKILL.md`, `agents/openai.yaml` và `policy.allow_implicit_invocation: true`.

## Xác thực skill

Validator của Codex Skill Creator cần PyYAML. Trên máy có `uv`, chạy:

```bash
for skill in .agents/skills/*; do
  uv run --with PyYAML -- python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" "$skill"
done
```

Nếu môi trường đã có module `yaml`, có thể thay `uv run --with PyYAML -- python3` bằng `python3`.

Sau mỗi thay đổi feature, chạy cổng toàn base từ repository root:

```bash
node verify-base.mjs
```

Có thể chạy `node verify-base.mjs server` hoặc `node verify-base.mjs client` để chẩn đoán từng stage; trước khi hoàn tất vẫn phải chạy cổng mặc định gồm cả hai stage.
