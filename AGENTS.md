# AGENTS.md — Đảo Đèn Lồng

Hướng dẫn ngắn cho AI agent khi phát triển và kiểm chứng dự án (đã cập nhật cho Phase 3 · Contract v1.2).

## Lệnh chuẩn
- Cài đặt & build: `npm install && npm run build`
- Chạy kiểm chứng toàn bộ (typecheck + headless build + unit test + contract scenarios v1.2 + regression Phase 1–2 + determinism + benchmark toàn Đêm 3): `npm test`
- Chạy game giao diện 3D: `npm run dev` (hoặc `npm run preview` sau khi build)
- Chạy headless (Đêm 1/2/3): `node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out tmp/out.jsonl`

## Kiến trúc bắt buộc
- `src/sim/` chứa **toàn bộ logic game thuần TypeScript**: KHÔNG import Three.js, DOM, `window`, hay `Math.random()`.
- `src/sim/maps.ts` định nghĩa duy nhất địa hình chuẩn 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông) dùng chung cho cả headless và client 3D.
- Mọi tính ngẫu nhiên trong `src/sim/` PHẢI đi qua PRNG có seed (`src/sim/prng.ts`) để đảm bảo tính tất định 100%.
- `src/sim/tuning.ts` PHẢI đồng bộ 100% với `game.contract.json` (kiểm tra tự động trong unit test).
- Nhiên liệu đèn PHẢI tính bằng **số nguyên đơn vị `1/60`** (`0..6000`) trong `src/sim/` để triệt tiêu sai số dấu phẩy động; chỉ làm tròn 1 chữ số thập phân khi xuất snapshot/event.
- `src/headless/` chỉ chứa CLI đọc tham số, validate scenario/inputs, chạy `src/sim/`, và xuất JSONL.
- `src/client/` chứa giao diện 3D (Three.js), bảng màu chuẩn + chế độ mù màu, menu/chiến dịch 3 Đêm, HUD, âm thanh và sáng tạo client-only (KHÔNG làm đổi đầu ra headless).

## Quy ước Test Contract v1.2 (Bắt buộc)
- Cố định 60 tick/s (`1/60s`). Tick 0 là snapshot sau khi dựng scenario (không phát event, không cộng điểm khi dựng scenario).
- Tuân thủ nghiêm **thứ tự 12 bước trong 1 tick** (pause → timers & trừ dầu + tắt đèn `fuel ≤ 0` ngay sau bước 2 → move/dash/launchpad/wind/fall → pickups → interact thắp/châm dầu → safe zones `fuel ≥ 30` → pulse → AI move gồm `drain` → drifter steal rồi shade hit theo id tăng dần → spawns → win/loss `no_flames > dawn_survived/dawn` → snapshot).
- Khi `paused`: `tick` tăng nhưng `sim_tick`, thời gian, dầu, hồi chiêu, spawn, TTL đều đứng yên; snapshot ghi `state: "paused"`.
- Trạng thái Bóng Mực dùng đúng 6 tên: `spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`.
- Không còn thắng sớm `all_lit`: chỉ thắng `dawn_survived` khi sống đến bình minh với số đèn sáng `≥ ceil(0.6 × tổng đèn)`.
- Điểm v1.2: nạp đom đóm `+5/mote`, thắp lần đầu `+100`, thắp lại `+40`, Tỏa Sáng `+5/con` (tổng `+15` nếu đang `drain`), bình minh khi thắng `+50 + floor(fuel)` mỗi đèn sáng và `+50` mỗi Ngọn Lửa (bỏ thưởng thời gian).
- File `inputs` hoặc `scenario` sai định dạng PHẢI thoát mã `2` và in thông báo lỗi ra `stderr`.
- Chạy headless 1 Đêm 3 đầy đủ (`18.000` tick = `300s`) PHẢI xong trong `≤ 30s`.

## Điều cấm
- KHÔNG viết test luôn đạt, không sửa tay output bằng chứng.
- KHÔNG bỏ qua (skip) test cũ âm thầm khi yêu cầu đổi; phải cập nhật hoặc gỡ kèm lý do rõ ràng trong `docs/notes/` (ADR) và `CHANGELOG.md`.
- KHÔNG thay đổi hằng số chuẩn Contract (`pickup_radius = 1`, `player_speed = 6`, ...) trong `src/sim/`.
- KHÔNG commit `.env`, API key, token hay file nháp `/Phase*.md`, `/Note.md`.
- KHÔNG tuyên bố hoàn thành khi `npm test` chưa xanh.
