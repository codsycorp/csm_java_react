# Coderabbit Not redirected automatically? Copy and paste the following link into the extension to continue.
dnNjb2RlOi8vY29kZXJhYmJpdC5jb2RlcmFiYml0LXZzY29kZS9hdXRoLWNhbGxiYWNrP2NvZGU9MTc4ODVjNTI1ZmYyNGUzYWZkMzUmc3RhdGU9MTVlMjNjYWMtNDBhMC00YzExLWFlZGYtNGVmODlmMzAzODViJnByb3ZpZGVyPWdpdGh1YiZzZWxmSG9zdGVkRG9tYWluPSZyZWRpcmVjdF91cmk9aHR0cHMlM0ElMkYlMkZhcHAuY29kZXJhYmJpdC5haSUyRmxvZ2lu
# Chạy trên server Linux
# CSM Server - Customer Success Manager

Hệ thống quản lý khách hàng và nội dung với Spring Boot + React/Vue + RocksDB + Lucene.

---

## 🚀 Quick Start

### Development

```bash
# Dev máy mạnh (từ backend/)
cd backend
set -a && source ../config.local-strong.env && set +a && mvn spring-boot:run

# Server yếu 5GB (repo root)
./run-server.sh

# Lần đầu: cp config.env.example config.env
# Frontend
cd frontend
pnpm install
pnpm dev
```

### Local Llama model setup (GGUF)

Chạy các lệnh này một lần để tránh lỗi thiếu file model `.gguf` khi backend khởi động:

```bash
mkdir -p backend/csm_datas/public/ai_local/model

curl -L --fail --retry 3 --retry-delay 5 \
  -o backend/csm_datas/public/ai_local/model/tinyllama-1.1b-chat-v1.0-q4_k_m.gguf \
  "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

# Cập nhật đường dẫn model trong config.env
echo 'AI_LOCAL_LLAMA_MODEL_PATH=/Volumes/Datas/CSM/JavaProjects/csm_server/backend/csm_datas/public/ai_local/model/tinyllama-1.1b-chat-v1.0-q4_k_m.gguf' >> config.env

# Chạy backend với config.env
cd backend
set -a && source ../config.env && set +a && mvn spring-boot:run
```

### Production Deployment

```bash
# Setup lần đầu
cp .env.example .env
# Edit .env với thông tin server

# Deploy
./deploy_production.sh --host root@your-server-ip

# Hoặc deploy nhanh
export SERVER_HOST="root@your-server-ip"
./quick_deploy.sh
```

📖 **Xem hướng dẫn chi tiết**: [DEPLOYMENT_README.md](DEPLOYMENT_README.md)

---

## 📚 Documentation

- 📘 [Deployment Guide](DEPLOYMENT_GUIDE.md) - Hướng dẫn deploy đầy đủ
- ⚡ [Performance Tuning](PERFORMANCE_TUNING.md) - Tối ưu cho 10k users
- 🚀 [Quick Deploy](DEPLOYMENT_README.md) - Deploy nhanh

---

## 🛠️ Management Scripts

```bash
./start.sh              # Start server
./stop.sh               # Stop server
./monitor.sh            # Monitor real-time
./load_test.sh          # Load testing
./optimize_system.sh    # Optimize Linux (run once)
./pre_deploy_check.sh   # Pre-deployment check
```

---

## 📦 Build Commands
--region cn-hongkong \
--body '{"serviceName":"os-nitrite-service"}'

# Chạy script deploy
./deploy.sh

# Cấu hình AccessKey
AccessKeyId	LTAI5t92exgN59SrcJXqQViD
AccessKeySecret	LSwHiGKNLkFgJUTjAAUZRoaSss1JCD
Default Region Id [cn-hongkong]	cn-hongkong

endpoint=oss-cn-hongkong.aliyuncs.com
accessKeyID=LTAI5t92exgN59SrcJXqQViD
accessKeySecret=LSwHiGKNLkFgJUTjAAUZRoaSss1JCD
region=cn-hongkong


Cách sử dụng DNS Validation với Certbot
Bước 1: Chạy Certbot với chế độ xác minh DNS
Mở Terminal và chạy lệnh:

sudo certbot certonly --manual --preferred-challenges=dns
sudo certbot certonly --manual --preferred-challenges=dns --rsa-key-size 2048
sudo certbot certonly --manual --preferred-challenges dns \
--key-type ecdsa --elliptic-curve secp384r1 \
-d api.phanmemmottrieu.net -d www.phanmemmottrieu.net -d static.phanmemmottrieu.net -d phanmemmottrieu.net
sudo certbot certonly --standalone -d api.phongthuyphattam.net -d api.phongthuyphattam.net
sudo certbot certonly --standalone -d api.phanmemmottrieu.net -d www.phanmemmottrieu.net -d static.phanmemmottrieu.net -d phanmemmottrieu.net
Nhập tên miền cần tạo chứng chỉ, ví dụ:

csm.phongthuyphattam.net static.phongthuyphattam.net api.phongthuyphattam.net
Bước 2: Tạo bản ghi DNS TXT
Certbot sẽ hiển thị một chuỗi giá trị TXT cần thêm vào DNS của bạn. Ví dụ:

Đối với tên miền csm.phongthuyphattam.net:

_acme-challenge.csm.phongthuyphattam.net
Giá trị TXT: abc123xyz456

Đối với tên miền www.csm.phongthuyphattam.net:

_acme-challenge.www.csm.phongthuyphattam.net
Giá trị TXT: def789ghi012

Thao tác trên Alibaba Cloud DNS:
Đăng nhập vào Alibaba Cloud DNS Console.

Chọn tên miền csm.phongthuyphattam.net.

Thêm 2 bản ghi TXT:

Host: _acme-challenge Value: abc123xyz456
Host: _acme-challenge.www Value: def789ghi012
Lưu lại các thay đổi.
# Vào https://apigateway.console.aliyun.com/ để lấy cấu hình DNS: 
# Ví dụ Public Second-level Domain: b8f93eb8a8c64cc0a5596a9a3a0372ef-cn-hongkong.alicloudapi.com
# Sau đó cấu hình trên trình quản lý tên miền riêng của mình.
# Cấu hình ssl bằng cách tạo xong upload vào SSL Certificate Management trên https://yundun.console.aliyun.com/?spm=5176.23591326.console-base_search-panel.dtab-product_cas.14faWZL6WZL6BN&p=cas#/certExtend/upload/ap-southeast-1?currentPage=1&pageSize=10&keyword=&statusCode=
# Kiểm tra file có chưa
sudo certbot certonly --manual --preferred-challenges dns \
--key-type ecdsa --elliptic-curve secp384r1 \
-d api.phanmemmottrieu.net -d www.phanmemmottrieu.net -d static.phanmemmottrieu.net -d phanmemmottrieu.net
sudo ls -l /etc/letsencrypt/live/api.phanmemmottrieu.net/
# Kiểm tra quyền
sudo ls -ld /etc/letsencrypt/live/api.phanmemmottrieu.net/
# Xong rồi chép ra
sudo cp /etc/letsencrypt/live/api.phanmemmottrieu.net/fullchain.pem /Volumes/Datas/CSM/alifc_jbackend /
sudo cp /etc/letsencrypt/live/api.phanmemmottrieu.net/privkey.pem /Volumes/Datas/CSM/alifc_jbackend /

# Tổng kết các bước lệnh:
# Tạo Certificate File:
cp /Volumes/Datas/CSM/alifc_jbackend /fullchain.pem /Volumes/Datas/CSM/alifc_jbackend /certificate.crt
# Tạo Certificate Key:
cp /Volumes/Datas/CSM/alifc_jbackend /privkey.pem /Volumes/Datas/CSM/alifc_jbackend /private.key
# Tạo Certificate Chain:
cp /Volumes/Datas/CSM/alifc_jbackend /fullchain.pem /Volumes/Datas/CSM/alifc_jbackend /certificate_chain.crt

openssl rsa -in /Volumes/Datas/CSM/alifc_jbackend /privkey.pem -out /Volumes/Datas/CSM/alifc_jbackend /rsa_private_key.pem

<!-- TEST API -->
HTTP_METHOD="POST"
CONTENT_TYPE="application/json"
DATE=$(date -u "+%a, %d %b %Y %H:%M:%S GMT")
RESOURCE="/2023-03-30/functions/leanh-fc-javabackend/invocations"
ACCESS_KEY_ID="LTAI5t92exgN59SrcJXqQViD"  # Thay thế bằng Access Key ID thực tế
ACCESS_KEY_SECRET="LSwHiGKNLkFgJUTjAAUZRoaSss1JCD"  # Thay thế bằng Access Key Secret thực tế
HOST="5185533208336278.cn-hongkong.fc.aliyuncs.com"
# Lấy ngày hiện tại theo định dạng /YYYY/MM/DD
CURRENT_DATE=$(date -u "+%Y/%m/%d")

# Tạo chuỗi cần ký
STRING_TO_SIGN="${HTTP_METHOD}\n${CONTENT_TYPE}\n\nx-fc-date:${DATE}\n${RESOURCE}"

# Tạo chữ ký bằng HMAC với khóa bí mật
SIGNATURE=$(echo -n "${STRING_TO_SIGN}" | openssl dgst -sha256 -hmac "${ACCESS_KEY_SECRET}" -binary | base64)

# Gửi yêu cầu HTTP POST tới Alibaba Cloud Function Compute
curl -X POST "https://${HOST}${RESOURCE}?qualifier=LATEST" \
  -H "Content-Type: ${CONTENT_TYPE}" \
  -H "x-fc-date: ${DATE}" \
  -H "x-fc-invocation-type: Sync" \
  -H "x-fc-log-type: None" \
  -H "Authorization: ACS3-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${CURRENT_DATE}, SignedHeaders=content-type;host;x-fc-date, Signature=${SIGNATURE}" \
  -d '{
    "action": "createUser",
    "user": {
      "id": "1",
      "name": "JohnDoe",
      "age": 30
    }
  }'
# Chạy local test backend
mvn spring-boot:run
mvn spring-boot:run -Plocal
export MAVEN_OPTS="-Xms512m -Xmx2048m"
mvn spring-boot:run
# Chạy local test frontend
pnpm dev
pnpm build
pnpm preview --port 3333
# Đưa lên api
mvn clean package -Pproduction
# Để build dự án không chạy qua test dùng lệnh sau
mvn clean package -DskipTests
mvn clean package -DskipTests -Pdev
mvn spring-boot:run -Dspring-boot.run.profiles=dev
mvn spring-boot:run -Dspring.profiles.active=dev
# Tổng hợp lệnh cài plugin Java nhẹ
codium --install-extension redhat.java
codium --install-extension formulahendry.code-runner

# Tạo lại SSL trên server member.suppercloud
sudo certbot --nginx -d csmbridge.net -d www.csmbridge.net -d api.csmbridge.net -d php.csmbridge.net -d kqxs.csmbridge.net -d static.csmbridge.net -d admin.csmbridge.net -d realtime.csmbridge.net -d tanphuice.com -d www.tanphuice.com -d nuocdatanphu.com -d www.nuocdatanphu.com -d h-holding.vn -d www.h-holding.vn -d admin.h-holding.vn -d h-holding.com.vn -d www.h-holding.com.vn
# Mở thiết bị android giả lập
~/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager create avd \
  -n Pixel_5_API_30 \
  -k "system-images;android-30;google_apis;x86_64" \
  -d "pixel"
~/Library/Android/sdk/emulator/emulator -avd Pixel_5_API_30
# Kiểm tra dung lượng các thư mục trên server
sudo du -sh /root/la_server/* | sort -rh | head -n 15
# Cấu hình dịch vụ test API FIDOVN
# house.phanmemmottrieu.net
# job.phanmemmottrieu.net
sudo systemctl start fidovn-house-user-api.service
sudo systemctl start fidovn-seo.service




công ty viết phần mềm theo yêu cầu,nhận viết phần mềm theo yêu cầu giá rẻ,nhận viết phần mềm theo yêu cầu,viết phần mềm theo yêu cầu tại hcm,chuyên viết phần mềm theo yêu cầu,dịch vụ viết phần mềm theo yêu cầu


Nhận viết phần mềm theo yêu cầu giá rẻ,Giá viết phần mềm theo yêu cầu,Viết phần mềm theo yêu cầu là gì,Viết phần mềm theo yêu cầu tại HCM và các tỉnh lân cận,Viết app theo yêu cầu,Viết code theo yêu cầu,Thuê viết phần mềm




Chúng tôi trong gần 20 năm cung cấp một loạt các dịch vụ như sau:

Viết Phần Mềm Theo Yêu Cầu: Phát triển phần mềm tùy chỉnh, đáp ứng chính xác các yêu cầu nghiệp vụ của bạn.
Ứng Dụng Di Động: Thiết kế và phát triển ứng dụng di động cho iOS và Android.
Phần Mềm Auto Web & Auto Click: Tự động hóa các tác vụ lặp đi lặp lại trên web, tiết kiệm thời gian và công sức.
Hệ Thống Nhà Thông Minh: Xây dựng hệ thống nhà thông minh, điều khiển mọi thiết bị trong nhà bằng điện thoại hoặc giọng nói.
Bãi Xe Thông Minh: Giải pháp quản lý bãi xe thông minh, giúp tối ưu hóa không gian và tăng doanh thu.
Tool tăng traffic website,Tăng lượt truy cập website ,Tăng traffic,tăng view cho bài viết

Viết Phần Mềm Theo Yêu Cầu đặc thù chuyên biệt


Tăng Traffic User Giúp Web Lên Top Google

Tool tăng traffic website,Tăng lượt truy cập website ,Tăng traffic,tăng view cho bài viết

Khám phá các phương pháp tăng traffic website bền vững, từ tối ưu hóa SEO Onpage & Offpage đến xây dựng nội dung chất lượng. Nắm vững chiến lược marketing online và tăng lượt truy cập.
Với chi phí chưa đến 200 ngàn VNĐ mỗi ngày cho hơn 1 ngàn người truy cập với thời gian trên trang theo thiết lập tuỳ chỉnh từ 2 phút trở lên.


SEO website,Cách SEO web lên top Google,Hướng dẫn làm SEO,Các bước SEO website,Bí kíp tăng thứ hạng website



Công cụ cào dữ liệu có thể click

Tôi đã từng làm các tool tự động đăng ký visa thị thực, đấu giá lazada, shopee,sendo. 
Click quảng cáo google, tăng trafic user các website với thời gian trên trang theo yêu cầu. Phần mềm tự đổi IP, phần mềm điền captcha từ đơn giản tự giải mã đến 
dùng thông qua các dịch vụ có trả phí online với các captcha phức tạp.
Zalo web chat nhóm thông báo tin quét tự động các trang bất động sản, quét thông tin tuyển dụng của các trang tuyển dụng....

Tool crawl dữ liệu từ các website,Web Scraper,Tự động click để thu thập dữ liệu,Phần mềm lấy dữ liệu tự động,Bot lấy dữ liệu



Tool tăng thứ hạng website giúp bạn SEO lên top Google nhanh nhất

Tôi cung cấp dịch vụ chạy tăng người dùng truy cập website,lượt tương tác, thời gian trên trang theo yêu cầu có thể cài đặt mà được Google ghi nhận là người dùng thực,
 từ đó tăng độ tin cậy và nội dung hấp dẫn người dùng do Google đánh giá. Hỗ trợ cài đặt các theo dõi lưu lượng truy cập website do google cung cấp. Chi phí chạy lưu lượng truy
 cập chưa đến 200k mỗi ngày với lượng người dùng truy cập cả ngàn người và thao tác vài ngàn thao tác do Google đánh giá và trả về. Công cụ này giúp bạn giảm
 chi phí chạy quảng cáo cho các từ khoá do chính sách google đưa ra. 


Cách SEO web lên top Google nhanh nhất,SEO ON TOP,Cách SEO từ khóa lên top,Đưa website lên top Google nhanh chóng và tự nhiên


===================

xem ngày tốt xấu

Bạn đang băn khoăn làm việc lớn? Đừng làm liều! Sử dụng công cụ xem ngày tốt xấu chuẩn xác theo tử vi, phong thủy để mọi việc hanh thông, tài lộc ùa về. 
Hàng triệu người đã thành công, còn bạn thì sao?

xem ngày cưới,xem ngày chuyển nhà,xem ngày khai trương,xem ngày mua xe,xem ngày xuất hành,xem ngày động thổ.


===========================
Viết phần mềm theo yêu cầu 

Viết phần mềm theo yêu cầu
Liên Hệ : Mr.Anh - 0964.014.947 - Email: phanmemmottrieu@gmail.com
website:http://www.phanmemmottrieu.net/

Viết phần mềm theo yêu cầu ** Liên Hệ:Mr.Anh ** ĐT:0964.014.947 **..
Phần mềm quản lý kho vật tư, quản lý nhân sự, marketing online, quản lý đặt vé online,quản lý nhà hàng quán cafe....
Hotline: 0964.014.947

Khi các phần mềm hiện sẵn có trên thị trường không thể đáp ứng được các yêu cầu công việc đặc thù của mình, quý vị có thể nghĩ ngay đến việc đặt viết một phần mềm theo yêu cầu riêng. Với Mr.Anh, việc thiết kế và xây dựng một phần mềm hoàn toàn theo yêu cầu đặc thù công việc của bạn không còn quá khó khăn hay tốn kém nữa. Với dịch vụ và quy trình viết phần mềm theo yêu cầu chuyên nghiệp của Mr.Anh, mọi yêu cầu riêng đặc biệt của quý vị đều được đáp ứng hơn cả mong đợi. 
Chúng tôi nhận viết phần mềm theo mọi yêu cầu (có thể chạy online và offline) trong thời gian nhanh nhất, chi phí thấp nhất, đảm bảo uy tín chất lượng. Với kinh nghiệm nhiều năm làm việc ở các công ty chuyên về phần mềm quản lý ở tất cả các lĩnh vực như: Phần mềm Kế toán, Phần mềm Nhân Sự, Phần mềm Quản lý Kho - Vật tư, Phần mềm Bán Hàng, Phần mềm Khách Sạn, Nhà hàng Café, Karaoke,.... Chúng tôi sẵn sàng đáp ứng tất cả các nhu cầu riêng đặc biệt của quý khách về phần mềm quản lý, với mọi quy mô từ nhỏ đến lớn, đa ngành, đa địa điểm.
Quy trình thực hiện: Lấy yêu cầu khách hàng - Tư vấn giải pháp - Triển khai phần mềm.
Các ưu điểm nổi bật về dịch vụ phần mềm theo yêu cầu của chúng tôi là:
Chi phí thấp và thời gian triển khai nhanh nhất.
Cam kết về chất lượng
Hỗ trợ 24/7
Đã được nhiều cá nhân, đơn vị sử dụng và đánh giá cao
Có thể nâng cấp, mở rộng không giới hạn các chức năng phần mềm tùy nhu cầu sử dụng.
Phương châm hoạt động của chúng tôi là "Lấy Khách hàng làm trọng tâm, mang lại giá trị thật sự cho khách hàng bẳng ưu thế đột phá".
“Đến với chúng tôi là đến với giải pháp chất lượng và chi phí tối ưu”


Nhận viết phần mềm theo yêu cầu giá rẻ,Giá viết phần mềm theo yêu cầu,Viết phần mềm theo yêu cầu từ xa,Viết app theo yêu cầu,Code phần mềm theo yêu cầu,Thuê viết phần mềm,Nhận làm phần mềm theo yêu cầu
