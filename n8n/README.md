# TH AI.Agent · n8n

n8n Community tại https://ai.th.io.vn, PostgreSQL riêng `th_n8n` trong PostgreSQL AI hiện có, workflow nhiều agent có thể thêm/xóa/chỉnh sửa bằng giao diện n8n. Bản nguồn AI.Agent cũ và dữ liệu cũ được giữ để phục hồi.

Workflow mẫu: Chat Trigger → AI Agent, nối Gemini / PostgreSQL Memory / Think / Research Agent / Sheet Agent. Research Agent gọi Perplexity; Sheet Agent ghi vào Google Sheets khi người dùng yêu cầu rõ ràng. Workflow ban đầu **Inactive**, chưa kết nối API key nên cài đặt không tạo yêu cầu AI hay ghi Sheet.

## Đăng nhập và kết nối

Tài khoản owner được tạo riêng tư trước khi mở hostname công khai, email `eric.scorp93@gmail.com`. Mật khẩu ban đầu được lưu **chỉ trên Pi** ở `~/th-platform/config/n8n-owner-login.json`; xem qua SSH và đổi trong Settings. Không gửi mật khẩu hoặc khóa API vào chat/GitHub.

- Gemini: tạo credential Google Gemini API, chọn credential ở cả ba node Model, chọn model đang có trong tài khoản.
- Perplexity: tạo Header Auth, tên header `Authorization`, giá trị `Bearer <API key của bạn>`; chọn ở node Perplexity.
- Google Sheets: bật Sheets API, thêm OAuth redirect URI `https://ai.th.io.vn/rest/oauth2-credential/callback` vào Web OAuth client, kết nối credential Google Sheets trong n8n. Chọn Spreadsheet, Sheet và các cột `Task`, `Result`, `Source` ở Append.
- Bộ nhớ PostgreSQL riêng được kết nối sẵn. Không dùng token OAuth hoặc cookie của các website khác làm thông tin đăng nhập n8n.
- Bấm Open chat để thử; chỉ Publish/Activate khi đã kiểm tra xong và muốn dùng trigger production.

API model có thể tính phí theo nhà cung cấp. Giới hạn production 1 workflow cùng lúc; các lượt chạy thủ công trong editor nên chạy lần lượt trên Pi 3 RAM 1 GB. Mỗi lượt tối đa 180 giây, lịch sử execution giữ 7 ngày hoặc 1000 lượt. Tệp nhị phân tới 10 MiB lưu trong PostgreSQL để nằm trong bản backup nhất quán.

## Vận hành và khôi phục

Các cơ chế deploy, swap bổ sung, backup và kiểm tra phục hồi do `TH-RPI.Server/n8n/` quản lý. Docker runtime và gateway được build AMD64/ARM64, gắn tag commit bất biến trong GHCR. Gateway giữ cổng 8081 và endpoint `/api/ready` tương thích console HDMI.

n8n dùng PostgreSQL và sao lưu định kỳ, **không dùng Drive-first cho từng transaction**. Mỗi 30 phút, TH-Server chụp PostgreSQL bằng exported snapshot, xuất workflow JSON và cấu hình cần phục hồi, mã hóa AES-256-GCM rồi upload có kiểm tra checksum vào `th-data/ai-agent/n8n/backups/<id>/`. SQL, workflow, cấu hình và bản volume đều có vỏ JSON mã hóa; manifest chỉ được ghi sau khi các tệp hoàn tất. Triển khai đầu tiên tải lại từ Drive và phục hồi vào database tạm để so sánh số dòng của tất cả bảng, không sửa production.

- Backup ngay: `python3 /opt/th-server-n8n/current/backup.py`
- Kiểm tra khôi phục riêng: `python3 /opt/th-server-n8n/current/backup.py --verify`
- Lịch backup: `systemctl list-timers th-n8n-backup.timer`
- Log: `journalctl -u th-n8n-backup.service -n 30`

Giữ riêng khóa khôi phục hiện có của TH-Server (`~/th-platform/config/recovery-key.txt`) ngoài Pi, trong nơi lưu bí mật của bạn. Backup n8n chứa encryption key của n8n dưới dạng đã mã hóa; cần khóa TH-Server để mở. Mất Pi có thể mất dữ liệu kể từ lần backup thành công gần nhất.

Không chạy workflow deploy AI foundation cũ khi n8n đang hoạt động. Cách rollback: dùng release AI.Agent đã ghi trong `~/th-platform/state/ai-agent-deployment.json`, dừng gateway n8n, rồi khởi động lại `ai-agent-api-1` và `ai-agent-web-1`; không xóa database hay volume.
