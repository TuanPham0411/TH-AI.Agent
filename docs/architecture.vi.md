# TH-AI — bản nền tảng

Thiết kế này thay thế đề xuất React/SQLite ban đầu theo thông tin MES do chủ sở hữu cung cấp.

- Frontend JavaScript/CSS và Vite; không dùng React. Giao diện tham khảo bố cục sidebar, màu xanh, thẻ nội dung và thiết lập cá nhân MES; mặc định tối.
- Backend Node.js 22 / Express 5; PostgreSQL và migration phiên bản. Chưa có workflow engine hay provider AI.
- Service `th-ai`, user `thai`, loopback `127.0.0.1:3100`.
- Database `th_ai`, role `th_ai_api`; không đọc database `th_app`.
- Release `/opt/th-ai/releases/`, symlink `/opt/th-ai/current`.
- Cấu hình riêng `/etc/th-ai/runtime.env`, file bền vững `/var/lib/th-ai/files`.
- Nginx host riêng `ai.th.io.vn`, tunnel hiện có chuyển tiếp `http://localhost:80`.
- Build/test và đóng gói runtime Node ARM64 trên GitHub; RPI chỉ nhận artifact. Docker là lựa chọn cho nền tảng khác, có workflow kiểm tra AMD64/ARM64.

## Xác thực

Chưa triển khai đăng nhập hoặc phân quyền. Không sao chép bảng user MES, không mở rộng cookie `th_mes`, không giả định biến AI_ORIGIN tồn tại. Nếu cần dùng chung tài khoản, cần thiết kế auth trung tâm và cấp phiên riêng cho AI. OAuth trực tiếp chỉ thêm khi được chọn, với callback riêng. API key chỉ được dùng phía server.

## Phạm vi tiếp theo

Chủ sở hữu sẽ bổ sung chức năng AI riêng: phòng ban, Agent, workflow, công cụ, nhiệm vụ và yêu cầu phê duyệt. Các mục điều hướng hiện là trạng thái trống, không biểu diễn chức năng đã chạy.
