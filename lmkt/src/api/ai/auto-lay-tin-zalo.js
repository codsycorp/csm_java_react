(async () => {
    console.log("🚀 Đang tiến hành lấy nội dung và danh sách ảnh Base64...");

    // Hàm chuyển đổi ảnh blob/url sang chuỗi Base64 thực tế
    const imgToBase64 = (imgEl) => {
        return new Promise((resolve) => {
            if (!imgEl || !imgEl.src) return resolve(null);
            try {
                const canvas = document.createElement('canvas');
                // Lấy kích thước tự nhiên để ảnh nét nhất
                canvas.width = imgEl.naturalWidth || imgEl.width;
                canvas.height = imgEl.naturalHeight || imgEl.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgEl, 0, 0);
                // Xuất ra chuỗi Base64
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                resolve(null);
            }
        });
    };

    // Hàm chuyển đổi ngày từ text sang date thực
    const convertDateText = (dateText) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Format: DD/MM/YYYY
        const formatDate = (date) => {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return `${d}/${m}/${y}`;
        };
        
        if (dateText.includes('Hôm nay')) {
            return formatDate(today);
        } else if (dateText.includes('Hôm qua')) {
            return formatDate(yesterday);
        }
        return dateText;
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Tu dong scroll len de tai het tin nhan cu
    const autoScrollChatList = async () => {
        const selectors = [
            '.chat-message-list',
            '.chat-msg-scroll',
            '.msg-list',
            '.zchat__body',
            '.chat-box__content'
        ];

        let scroller = null;
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.scrollHeight > el.clientHeight + 50) {
                scroller = el;
                break;
            }
        }

        if (!scroller) {
            scroller = document.scrollingElement || document.documentElement;
        }

        const maxScrolls = 80;
        const waitMs = 500;
        let lastHeight = -1;
        let stableCount = 0;

        for (let i = 0; i < maxScrolls; i += 1) {
            scroller.scrollTop = 0;
            await sleep(waitMs);
            const currentHeight = scroller.scrollHeight;
            if (currentHeight === lastHeight) {
                stableCount += 1;
                if (stableCount >= 3) break;
            } else {
                stableCount = 0;
                lastHeight = currentHeight;
            }
        }
    };

    await autoScrollChatList();

    // Lấy toàn bộ các block ngày (block-date)
    const allBlockDates = document.querySelectorAll('.block-date');
    const finalData = [];

    for (const blockDate of allBlockDates) {
        // Lấy ngày từ span[data-translate-inner="STR_DATE_TIME"]
        const dateElement = blockDate.querySelector('.chat-date [data-translate-inner="STR_DATE_TIME"]');
        let dateStr = dateElement ? dateElement.innerText.trim() : '';
        
        // Chuyển đổi "Hôm nay", "Hôm qua" thành ngày thực
        dateStr = convertDateText(dateStr);

        // Lấy toàn bộ chat-item trong block này
        const chatItems = blockDate.querySelectorAll('.chat-item');
        let lastKnownTime = '';
        let pendingMessages = [];
        let lastKnownSender = '';

        for (const chatItem of chatItems) {
            // Lấy toàn bộ các wrapper tin nhắn trong chat-item này
            const msgWrappers = chatItem.querySelectorAll('.message-wrapper');

            for (const wrap of msgWrappers) {
                // Lấy thời gian trong wrapper hiện tại; nếu không có thì thử tìm trong chat-item
                const timeElementInWrap = wrap.querySelector('.card-send-time__sendTime');
                const timeElementInItem = chatItem.querySelector('.card-send-time__sendTime');
                const timeElement = timeElementInWrap || timeElementInItem;
                const timeStr = timeElement ? timeElement.innerText.trim() : '';

                // Kiểm tra xem wrapper này có phải là bắt đầu của một tin nhắn mới (có tên người gửi) không
                const senderWrapper = wrap.querySelector('.message-sender-name-wrapper');

                // Lấy tên người gửi (có thể không có ở tin cùng chuỗi)
                const senderNameEl = senderWrapper ? wrap.querySelector('.message-sender-name-content') : null;
                const senderText = senderNameEl ? senderNameEl.innerText.trim() : (lastKnownSender || 'Unknown');
                if (senderWrapper && senderText) {
                    lastKnownSender = senderText;
                }

                // Khởi tạo Object mới cho tin nhắn này - có đủ ngày giờ
                const message = {
                    date: dateStr,
                    time: "",
                    sender: senderText,
                    content: "",
                    images: [] // Danh sách chứa các chuỗi Base64
                };

                // 1. Lấy nội dung chữ từ text-container
                const textContainer = wrap.querySelector('[data-component="text-container"]');
                if (textContainer) {
                    const text = textContainer.innerText.trim();
                    if (text) {
                        message.content = text;
                    }
                }

                // 2. Lấy toàn bộ ảnh zimg-el và chuyển thành Base64
                const imgElements = wrap.querySelectorAll('img.zimg-el');
                for (const img of imgElements) {
                    // Chỉ lấy ảnh thật (có kích thước > 50px), bỏ qua icon
                    if (img.naturalWidth > 50) {
                        const b64 = await imgToBase64(img);
                        if (b64) {
                            message.images.push(b64);
                        }
                    }
                }

                // Nếu không có text và ảnh thì bỏ qua (tránh bắt nhầm wrapper trống)
                if (!message.content && message.images.length === 0) {
                    continue;
                }

                // Xử lý time: backfill cho các tin trước đó nếu thiếu, hoặc dùng time gần nhất
                if (timeStr) {
                    message.time = timeStr;
                    if (pendingMessages.length) {
                        pendingMessages.forEach((msg) => {
                            msg.time = timeStr;
                        });
                        pendingMessages = [];
                    }
                    lastKnownTime = timeStr;
                } else if (lastKnownTime) {
                    message.time = lastKnownTime;
                } else {
                    pendingMessages.push(message);
                }

                // Đẩy tin nhắn vào mảng
                finalData.push(message);
            }
        }
    }

    // ===== HÀM EXPORT JSON =====
    const downloadJSON = (data, filename = 'zalo-data.json') => {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log(`✅ Đã download file: ${filename}`);
    };

    const copyToClipboard = (data) => {
        const jsonStr = JSON.stringify(data, null, 2);
        navigator.clipboard.writeText(jsonStr).then(() => {
            console.log("✅ Đã copy JSON vào clipboard!");
            alert("✅ Đã copy JSON vào clipboard!\nBạn có thể Ctrl+V để dán vào chỗ khác.");
        }).catch(() => {
            console.warn("❌ Không thể copy vào clipboard, sử dụng fallback");
            prompt("Ctrl+C để copy JSON này:", jsonStr);
        });
    };

    // XUẤT KẾT QUẢ
    console.log("✅ Đã trích xuất xong danh sách tin nhắn và ảnh Base64!");
    console.dir(finalData); 

    // Gán vào biến toàn cục để bạn truy cập
    window.finalZaloData = finalData;

    // ===== TẠO UI DOWNLOAD =====
    const uiContainer = document.createElement('div');
    uiContainer.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        background: white;
        border: 2px solid #1677ff;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        font-family: Arial, sans-serif;
    `;

    const title = document.createElement('div');
    title.textContent = '📥 Xuất Dữ Liệu Zalo';
    title.style.cssText = `
        font-weight: bold;
        margin-bottom: 12px;
        color: #1677ff;
        font-size: 14px;
    `;

    const countInfo = document.createElement('div');
    countInfo.textContent = `✅ Đã trích xuất: ${finalData.length} tin nhắn`;
    countInfo.style.cssText = `
        font-size: 13px;
        color: #666;
        margin-bottom: 12px;
    `;

    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '⬇️ Download JSON';
    downloadBtn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 8px;
        background: #1677ff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 13px;
        transition: background 0.3s;
    `;
    downloadBtn.onmouseover = () => downloadBtn.style.background = '#0958ca';
    downloadBtn.onmouseout = () => downloadBtn.style.background = '#1677ff';
    downloadBtn.onclick = () => {
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadJSON(finalData, `zalo-messages-${timestamp}.json`);
    };

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy JSON';
    copyBtn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 8px;
        background: #52c41a;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 13px;
        transition: background 0.3s;
    `;
    copyBtn.onmouseover = () => copyBtn.style.background = '#389e0d';
    copyBtn.onmouseout = () => copyBtn.style.background = '#52c41a';
    copyBtn.onclick = () => copyToClipboard(finalData);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #999;
    `;
    closeBtn.onclick = () => uiContainer.remove();

    uiContainer.appendChild(title);
    uiContainer.appendChild(countInfo);
    uiContainer.appendChild(downloadBtn);
    uiContainer.appendChild(copyBtn);
    uiContainer.appendChild(closeBtn);
    document.body.appendChild(uiContainer);

    console.log("--------------------------------------------------");
    console.log("✅ UI DOWNLOAD ĐÃ SẴN SÀNG!");
    console.log("Cấu trúc mảng hiện tại: [ {date, time, sender, content, images: [base64, base64...]} ]");
    console.log("👉 Nhấn nút '⬇️ Download JSON' hoặc '📋 Copy JSON' ở góc phải dưới màn hình");
    console.log("👉 Hoặc gõ: copy(finalZaloData) để copy vào clipboard");
    console.log("--------------------------------------------------");
})();