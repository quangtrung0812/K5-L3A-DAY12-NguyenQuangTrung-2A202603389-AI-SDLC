# AGENTS.md — Đảo Đèn Lồng

Hướng dẫn ngắn cho AI agent khi phát triển và kiểm chứng dự án.

## Lệnh chuẩn
- Cài đặt & build: `npm install && npm run build`
- Chạy kiểm chứng toàn bộ (typecheck + headless build + unit test + contract scenarios + determinism): `npm test`
- Chạy game giao diện 3D: `npm run dev` (hoặc `npm run preview` sau khi build)
- Chạy headless: `node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out tmp/out.jsonl`

## Kiến trúc bắt buộc
- `src/sim/` chứa **toàn bộ logic game thuần TypeScript**: KHÔNG import Three.js, DOM, `window`, hay `Math.random()`.
- Mọi tính ngẫu nhiên trong `src/sim/` PHẢI đi qua PRNG có seed (`src/sim/prng.ts`) để đảm bảo tính tất định 100%.
- `src/sim/tuning.ts` PHẢI đồng bộ 100% với `game.contract.json` (được kiểm tra tự động trong unit test).
- `src/headless/` chỉ chứa CLI đọc tham số, validate scenario/inputs, chạy `src/sim/`, và xuất JSONL.
- `src/client/` chứa giao diện 3D (Three.js), HUD, âm thanh và các chi tiết sáng tạo chỉ chạy ở client (KHÔNG làm đổi hành vi headless).

## Quy ước Test Contract v1.0
- Cố định 60 tick/s (`1/60s`). Tick 0 là snapshot sau khi dựng scenario (không phát event, không cộng điểm khi dựng scenario).
- Bước `k` đọc input tick `k` → tạo trạng thái `k+1`, event ghi `tick = k + 1`.
- Mọi khoảng cách trong `tuning` đo theo mặt phẳng ngang `XZ`, điều kiện "trong bán kính r" là `distXZ <= r`.
- File `inputs` hoặc `scenario` sai định dạng PHẢI thoát mã `2` và in thông báo lỗi ra `stderr`.
- Tọa độ và `time_left_s` trong JSONL làm tròn 3 chữ số thập phân.

## Điều cấm
- KHÔNG viết test luôn đạt, không sửa tay output bằng chứng.
- KHÔNG bỏ qua test cũ khi yêu cầu đổi; phải cập nhật hoặc gỡ kèm lý do trong `docs/notes/`.
- KHÔNG commit `.env`, API key, token hay file nháp `Phase*.md`.
- KHÔNG tuyên bố hoàn thành khi `npm test` chưa xanh.
