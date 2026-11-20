# AGENTS.md — Đảo Đèn Lồng

Hướng dẫn ngắn cho AI agent khi phát triển và kiểm chứng dự án (đã cập nhật cho Phase 2 · Contract v1.1).

## Lệnh chuẩn
- Cài đặt & build: `npm install && npm run build`
- Chạy kiểm chứng toàn bộ (typecheck + headless build + unit test + contract scenarios v1.1 + regression + determinism + benchmark 21.600 tick): `npm test`
- Chạy game giao diện 3D: `npm run dev` (hoặc `npm run preview` sau khi build)
- Chạy headless (Đêm 1/2/3): `node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out tmp/out.jsonl`

## Kiến trúc bắt buộc
- `src/sim/` chứa **toàn bộ logic game thuần TypeScript**: KHÔNG import Three.js, DOM, `window`, hay `Math.random()`.
- `src/sim/maps.ts` định nghĩa duy nhất địa hình chuẩn 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông) dùng chung cho cả headless và client 3D.
- Mọi tính ngẫu nhiên trong `src/sim/` PHẢI đi qua PRNG có seed (`src/sim/prng.ts`) để đảm bảo tính tất định 100%.
- `src/sim/tuning.ts` PHẢI đồng bộ 100% với `game.contract.json` (kiểm tra tự động trong unit test).
- `src/headless/` chỉ chứa CLI đọc tham số, validate scenario/inputs, chạy `src/sim/`, và xuất JSONL.
- `src/client/` chứa giao diện 3D (Three.js), bảng màu chuẩn, menu/chiến dịch 3 Đêm, HUD, âm thanh và sáng tạo client-only (KHÔNG làm đổi đầu ra headless).

## Quy ước Test Contract v1.1 (Bắt buộc)
- Cố định 60 tick/s (`1/60s`). Tick 0 là snapshot sau khi dựng scenario (không phát event, không cộng điểm khi dựng scenario).
- Tuân thủ nghiêm **thứ tự 12 bước trong 1 tick** (pause → timers → move/dash/launchpad/wind/fall → pickups → deposit → safe zones → pulse → AI move → drifter steal rồi shade hit theo id tăng dần → spawns → win/loss → snapshot).
- Khi `paused`: `tick` tăng nhưng `sim_tick`, thời gian, hồi chiêu, spawn, TTL đều đứng yên; snapshot ghi `state: "paused"`.
- Trạng thái Bóng Mực dùng đúng 5 tên: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Điểm tính khi **nạp** đom đóm (`+10/mote`), thắp đèn (`+100`), trúng Tỏa Sáng (`+5/con/lần`), thưởng thắng (`floor(time_left_s)*2 + flames*50`).
- File `inputs` hoặc `scenario` sai định dạng PHẢI thoát mã `2` và in thông báo lỗi ra `stderr`.
- Chạy headless 1 Đêm đầy đủ (tối đa 21.600 tick) PHẢI xong trong `≤ 30s`.

## Điều cấm
- KHÔNG viết test luôn đạt, không sửa tay output bằng chứng.
- KHÔNG bỏ qua test cũ khi yêu cầu đổi; phải cập nhật hoặc gỡ kèm lý do trong `docs/notes/`.
- KHÔNG commit `.env`, API key, token hay file nháp `Phase*.md`.
- KHÔNG tuyên bố hoàn thành khi `npm test` chưa xanh.
