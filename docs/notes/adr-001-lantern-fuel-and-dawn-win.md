# ADR-001: Mô hình nhiên liệu đèn (1/60 nguyên), Bóng Mực hút dầu và luật thắng Bình Minh (Phase 3 · Contract v1.2)

- **Trạng thái:** Đã chấp nhận (Accepted)
- **Ngày:** 2026-11-20
- **Bối cảnh:** TICKET-03 — Change Request *"Đèn cạn dầu"* (Phase 3, nâng cấp Test Contract từ `v1.1` lên `v1.2`).

---

## 1. Bối cảnh & Vấn đề

Sau Phase 2, playtest cho thấy người chơi giỏi có thể thắp sáng toàn bộ đèn chỉ trong ~2 phút và thắng sớm (`all_lit`), khiến nửa sau của Đêm thiếu căng thẳng chiến thuật. TICKET-03 yêu cầu thay đổi cốt lõi sang cơ chế **giữ đảo sáng tới bình minh**:

1. Đèn đã thắp vẫn cạn dầu (`1.0/giây`) và có thể tắt nếu không châm dầu.
2. Đèn yếu dầu (`fuel < 30`) mất vùng an toàn `6 m` và thu hút Bóng Mực (`wander` → `drain`, hút `5/giây` cộng dồn).
3. Không còn thắng sớm khi thắp đủ đèn; chỉ thắng khi sống sót đến bình minh với số đèn sáng `≥ ceil(0.6 × tổng đèn)`.
4. Sức chứa đom đóm tăng dần `10 + 2 × successful_lights` (tối đa `20`), bảng điểm thay thế hoàn toàn, và bổ sung chế độ mù màu.

---

## 2. Quyết định kiến trúc

### 2.1. Biểu diễn nhiên liệu bằng đơn vị nguyên `1/60` (`fuelUnits`)
- **Quyết định:** Lưu nhiên liệu nội bộ trong `LanternEntity.fuelUnits: number` thuộc tập số nguyên `[0, 6000]` (tương ứng `fuel = fuelUnits / 60`).
  - Đầy dầu: `6000` (`100.0`).
  - Ngưỡng mất vùng an toàn / cảnh báo: `1800` (`30.0`, kiểm tra `fuelUnits < 1800` → đúng `30.0` vẫn còn vùng an toàn).
  - Hao tự nhiên mỗi tick: `-1` đơn vị (`1/60`).
  - Hút dầu bởi mỗi Bóng Mực `drain`: `-5` đơn vị (`5/60`), cộng dồn khi nhiều con cùng hút.
  - Châm dầu mỗi đom đóm: `+600` đơn vị (`10.0`), số đom đóm cần là `Math.ceil((6000 - fuelUnits) / 600)`.
  - Chỉ làm tròn 1 chữ số thập phân (`Math.round((fuelUnits / 60) * 10) / 10`) khi xuất snapshot và sự kiện (`refuel`, `fuel_drain`). Thưởng bình minh dùng `Math.floor(fuelUnits / 60)`.
- **Lý do:** Loại bỏ tuyệt đối sai số dấu phẩy động (ví dụ `100 - 1/60` lặp 6000 lần không bao giờ lệch `0.0000001` hay làm sai `ceil((100 - fuel) / 10)`), đảm bảo 100% tất định SHA-256 đa nền tảng.

### 2.2. Máy trạng thái Đèn Lồng (Lantern State Machine)
```text
[Chưa từng sáng]  --(nạp đủ 10)--> [Đang sáng · An toàn (fuel ≥ 30, ever_lit=true)]
                                          |  ^
                       (fuel < 30)        v  |  (châm dầu lên ≥ 30 -> đẩy Bóng Mực 30t)
                                   [Đang sáng · Yếu (0 < fuel < 30, mất vùng an toàn)]
                                          |
                                     (fuel ≤ 0, sau Bước 2 -> lantern_out)
                                          v
[Đã từng sáng · Tắt (ever_lit=true, deposited=0)] --(nạp đủ 5, relight=true)--> [Đang sáng · An toàn (fuel=100)]
```
- Chọn đèn khi Tương tác (`E`/`F`): chỉ xét các đèn trong bán kính `2.0 m` (XZ, `|Δy| ≤ 2.0 m`) **có thể nhận thêm đom đóm** (chưa sáng, hoặc đang sáng nhưng `fuelUnits < 6000`). Đèn đầy dầu bị bỏ qua hoàn toàn (không phát sự kiện, không cộng điểm).

### 2.3. Mở rộng máy trạng thái Bóng Mực thêm `drain`
- Các trạng thái hợp lệ Contract v1.2: `spawning | wander | chase | recoil | stunned | drain`.
- **Bước 2 (trừ dầu):** Giảm `1` đơn vị/tick cho mọi đèn sáng và `5` đơn vị/tick cho mỗi Bóng Mực đang ở trạng thái `drain` nhắm vào đèn đó; tăng bộ đếm `drainTicks` của từng Bóng Mực và phát sự kiện `fuel_drain` mỗi bội `60` tick. Ngay sau Bước 2, mọi đèn có `fuelUnits <= 0` chuyển tắt (`deposited = 0`, phát `lantern_out`) và các Bóng Mực đang hút đèn đó quay về `wander`.
- **Bước 7 (Tỏa Sáng):** Ghi nhận `wasDraining = (shade.state === 'drain')` trước khi choáng để cộng tổng `+15` điểm (thay vì `+5`), đồng thời xóa `targetLanternId` và `drainTicks`.
- **Bước 8 (AI di chuyển):**
  - `wander`: ưu tiên đuổi Mây nếu `≤ 12 m`; nếu không, đi về đèn sáng có `fuel < 30` gần nhất (bằng nhau chọn `id` nhỏ hơn), khi tới `≤ 2 m` chuyển sang `drain`. Nếu không có đèn yếu, đi về đèn tắt gần nhất (fallback điểm tuần tra nếu mọi đèn đều sáng `≥ 30`).
  - `drain`: đứng yên hút dầu; chuyển `chase` nếu Mây vào `≤ 6 m`; chuyển `wander` nếu đèn tắt, đèn được châm lên `≥ 30`, hoặc cách đèn `> 2 m`.
  - Hết `stunned` luôn về `wander` (không giữ leash `18 m` cũ).

### 2.4. Luật thắng Bình Minh & Sức chứa tăng dần
- Thời gian Đêm 1 / 2 / 3 rút ngắn còn `240 / 270 / 300 s`.
- Bỏ hoàn toàn điều kiện thắng sớm `all_lit` (kể cả guard tick 1).
- Ở Bước 11 (cuối mỗi tick, kể cả tick bình minh):
  1. `flames <= 0` → thua `no_flames` ngay lập tức (ưu tiên cao nhất).
  2. `simTick >= totalDurationTicks`:
     - Nếu `litCount >= Math.ceil(0.6 * totalLanterns)` → thắng `dawn_survived`, cộng `+50 + floor(fuel)` cho mỗi đèn sáng và `+50` cho mỗi Ngọn Lửa còn lại (bỏ thưởng thời gian).
     - Ngược lại → thua `dawn`.
- Sức chứa động: `capacity = Math.min(20, 10 + 2 * successfulLights)`. Đèn đặt sẵn qua `scenario` không cộng vào `successfulLights`.

### 2.5. Chế độ mù màu & Phân biệt hình dạng không cần màu (Client-only)
- Toàn bộ hiển thị mù màu (viền/mắt Bóng Mực `#7A3CFF` → `#00B3FF`, cảnh báo UI `#FF5A5F` → `#FFFFFF` kèm biểu tượng `⚠`), đèn tắt xẹp `20%` kèm vết rách giấy, thanh dầu nổi trên đèn sáng và nhấp nháy `1 Hz` khi `fuel < 30` nằm hoàn toàn ở `src/client/`, không ảnh hưởng 1 byte nào tới đầu ra headless.

---

## 3. Các phương án đã cân nhắc

| Phương án | Đánh giá | Lý do chọn / loại |
|---|---|---|
| Lưu `fuel` bằng `number` (float) trừ `1/60` mỗi tick | Đơn giản nhưng cộng dồn sai số `0.00000000001` làm sai ranh giới `30.0` và `ceil((100 - fuel)/10)` | **Loại** |
| Lưu `fuelUnits` số nguyên `0..6000` (đơn vị `1/60`) | Chính xác tuyệt đối mọi phép tính, khớp khuyến nghị TICKET-03 | **Chọn** |
| Cho đèn tắt chỉ đổi màu tối như Phase 2 | Vi phạm yêu cầu hỗ trợ mù màu / phân biệt không cần màu | **Loại** |
| Thay đổi hình học đèn tắt (xẹp `20%` + vết rách) + thanh dầu & nhấp nháy `1 Hz` | Dễ nhận biết ngay cả khi xem thang xám (grayscale) | **Chọn** |

---

## 4. Ảnh hưởng tới Test cũ (Phase 1–2) & Xử lý minh bạch

Không có test nào bị skip âm thầm; mọi test chịu tác động bởi `[THAY THẾ]` đã được cập nhật kèm lý do rõ ràng:

| Test / Kịch bản cũ | Trạng thái | Lý do theo TICKET-03 |
|---|---|---|
| `tests/sim.test.ts` — kiểm tra `game.contract.json` v1.1 | **Cập nhật → v1.2** | Bổ sung 8 trường tuning mới, thời lượng `240/270/300s` và bảng điểm v1.2. |
| `tests/sim.test.ts` — thắng sớm `all_lit` & thưởng `per_second_left` | **Thay thế** | `[THAY THẾ]` Không còn thắng sớm `all_lit` và bỏ thưởng thời gian; thay bằng test xác nhận thắp đủ 5 đèn không kết thúc sớm + test thắng `dawn_survived` với điểm `+50 + floor(fuel)` và `+50/flame`. |
| `tests/sim.test.ts` — `all_lit` thắng ở tick hết giờ (`simTie`) | **Thay thế** | `[THAY THẾ]` Đổi sang xác nhận tick bình minh: `≥ 3/5` thắng `dawn_survived`, `< 3/5` thua `dawn`, và `flames = 0` ở đúng tick bình minh luôn thua `no_flames`. |
| `scripts/verify-contract.mjs` — `R02` (`s02_light_and_win`) | **Cập nhật → R02 (v1.2)** | `[THAY THẾ]` Thắp đèn thứ 5 ở tick 101 không còn kết thúc game (`state` vẫn `playing`, `lantern_lit.relight === false`, điểm nạp `+5/mote` + `+100` đèn = `150`, `capacity` tăng `10 → 12`). Luật thắng bình minh được kiểm chứng riêng tại `P3-04`. |
| `scripts/verify-contract.mjs` — `PERF` Night 3 | **Cập nhật → 18.000 tick** | Đêm 3 đổi từ `360s` (`21.600` tick) xuống `300s` (`18.000` tick) theo Contract v1.2; vẫn đo toàn bộ 1 Đêm đầy đủ `≤ 30s`. |
| `R01`, `R03`, `R04`, `R05`, `R06`, `P2-01`..`P2-06` | **Giữ nguyên & PASS** | Không bị thay thế bởi TICKET-03; đảm bảo hồi quy 100% Phase 1–2. |
