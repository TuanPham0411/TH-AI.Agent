> Deployment deferred: use docs/REINSTALL.md. Legacy native instructions below are reference only; no production workflow is enabled.

# Triển khai TH-AI riêng trên th-server

Chưa thực thi trên RPI. Không thay đổi service `th-app`, cổng 3000, database `th_app`, tunnel SSH hay cấu hình MES. Chỉ triển khai mã tin cậy. Giới hạn AI: RAM 224 MB, heap 128 MB, CPU 50%, pool PostgreSQL 2 kết nối; cần đo tổng tài nguyên trên máy trước khi bật.

## Chuẩn bị một lần trên RPI

Kiểm tra ARM64 Linux, dung lượng, cổng 3100 còn trống, Nginx/PostgreSQL đang hoạt động. Kiểm tra backup MES hiện có và ghi nhận trạng thái `th-app`, MES, portfolio, SSH và cloudflared. Không sửa cấu hình PostgreSQL toàn cục.

Tạo system user `thai` không có shell đăng nhập; thư mục `/etc/th-ai` quyền 700; `/var/lib/th-ai/files` sở hữu `thai:thai` quyền 700. Tạo role PostgreSQL **riêng** `th_ai_api` không có quyền superuser/createdb/createrole, database `th_ai` do role đó sở hữu. Nhập mật khẩu bằng `\password th_ai_api` trong psql cục bộ, không đưa mật khẩu vào lệnh shell/log. Dừng nếu tên role/database đã tồn tại và chưa rõ nguồn gốc.

Dùng `sudoedit /etc/th-ai/runtime.env`, tham khảo `runtime.env.example`; file root:root quyền 600. DATABASE_URL phải trỏ `th_ai` với user `th_ai_api`; URI-encode ký tự đặc biệt của mật khẩu. File được source bằng Bash khi triển khai nên giá trị cần được quote đúng. Không thêm biến OAuth/SMTP/AI khi chưa dùng.

## Build và cài release

Workflow `ai-build.yml` build/test trên GitHub-hosted runner rồi tạo artifact `ai-release` có checksum và Node 22 ARM64. Không build/cài npm trên Pi. Runner production cần được đăng ký cho repository này trước khi chạy job deploy.

Sau khi tải artifact lên Pi, kiểm tra `sha256sum -c ai-release.sha256` rồi giải nén vào một thư mục mới. Cài bản đầu từ terminal quản trị:

```sh
sudo bash /path/to/unpacked/deploy/install-release.sh /path/to/unpacked RELEASE_ID
```

Installer yêu cầu tài khoản/database/config đã được chuẩn bị; kiểm tra host/cổng, chạy migration AI, chuyển symlink, khởi động `th-ai`, kiểm tra ready và MES, sau đó reload Nginx. Có khôi phục app/config nếu bước chuyển release lỗi; migration không tự rollback. Giữ migration tương thích release trước. Không tự dọn release cũ.

Để dùng job deploy thủ công, cài bản installer đã duyệt vào `/usr/local/sbin/th-ai-deploy` (root:root, 755), cấu hình quyền sudo chỉ cho lệnh đó đối với tài khoản runner, và tạo GitHub environment `th-ai-production` với giới hạn nhánh/người duyệt phù hợp. Quyền gọi installer với artifact tương đương quyền triển khai mã hệ thống: chỉ cấp cho maintainer tin cậy. Không dùng lệnh `/usr/local/sbin/th-deploy` của MES. Runner phải được cấp cho repo AI và có tên `th-server`, labels `[self-hosted, Linux, ARM64]`. Job chỉ chạy khi workflow_dispatch trên main với deploy=true; không chạy mã PR trên RPI.

## Cloudflare

Trong tunnel đang dùng, thêm đúng một published route `ai.th.io.vn` → HTTP `localhost:80`, không override Host header. Giữ các route cũ, không sao chép token vào repo. Kiểm tra DNS `ai` về cùng tunnel, giải quyết xung đột record cùng tên có chủ đích.

## Kiểm tra sau triển khai

```sh
curl -f http://127.0.0.1:3100/api/ready
curl -f -H 'Host: ai.th.io.vn' http://127.0.0.1/
curl -f https://ai.th.io.vn/
curl -f https://ai.th.io.vn/api/ready
curl -f https://mes.th.io.vn/api/health
curl -f https://th.io.vn/
sudo systemctl status th-ai th-app nginx postgresql cloudflared ssh --no-pager
```

Kiểm tra giao diện trên điện thoại, đổi ngôn ngữ/giao diện rồi tải lại. Đây là web nền tảng công khai; không có đăng nhập hoặc dữ liệu riêng tư.

## Backup và rollback

Backup database `th_ai` bằng `pg_dump -Fc`, thư mục `/var/lib/th-ai/files` và `/etc/th-ai/runtime.env` vào nơi chỉ quản trị viên truy cập trên thiết bị khác. Khi có dữ liệu nghiệp vụ, dừng riêng `th-ai` để chụp DB/files nhất quán rồi bật lại. Không in nội dung runtime.env. Thử khôi phục sang database test riêng trước khi dựa vào backup; chưa kiểm chứng restore production.

Rollback: chọn release trước đã xác minh dưới `/opt/th-ai/releases/`, tạo symlink tạm tới release đó rồi `mv -Tf` sang `/opt/th-ai/current`, restart riêng `th-ai`, kiểm tra `/api/ready` và domain công khai. Nếu release thay đổi Nginx/unit, khôi phục đúng cấu hình AI đi kèm, `nginx -t` và daemon-reload trước khi restart/reload. Không rollback database bằng cách drop: dùng migration tương thích hoặc quy trình restore riêng đã kiểm chứng.

## Docker trên nền tảng khác

`Dockerfile` có targets `api` và `web`, base image đa kiến trúc; workflow `ai-images.yml` build linux/amd64 và linux/arm64, publish lên GHCR khi push main hoặc chạy thủ công. Image: `ghcr.io/tuanpham0411/th-agent-api` và `ghcr.io/tuanpham0411/th-agent-web`, tag `latest` và commit SHA. PR chỉ kiểm tra build. Compose tạo PostgreSQL riêng và volumes `ai-db`, `ai-files`; không dùng để thay thế production systemd trên RPI.

Đặt `TH_AI_DB_PASSWORD` và `DATABASE_URL` qua cơ chế bí mật cục bộ, không commit; URL dùng hostname `db`, database `th_ai`, role `th_ai_api`, password khớp. Chạy `docker compose up --build -d`. Web bind loopback 8081. Chưa có auth; chỉ công khai sau khi kiểm tra phạm vi sử dụng. Database và files tồn tại ngoài image/release trong volumes; không dùng `down -v` với dữ liệu cần giữ.
