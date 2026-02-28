async function fbScraperToBase64() {
    console.log("%cBẮT ĐẦU: Quét nội dung và chuyển đổi hình ảnh sang Base64...", "color: white; background: #8e44ad; padding: 5px; font-weight: bold;");

    const storage = new Map();
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    // 1. Hàm chuyển đổi URL ảnh sang Base64
    const getBase64FromUrl = async (url) => {
        try {
            const data = await fetch(url);
            const blob = await data.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => resolve(reader.result);
            });
        } catch (e) {
            return null; // Trả về null nếu ảnh bị chặn (CORS)
        }
    };

    const simulateRealClick = (element) => {
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
    };

    const extractData = async () => {
        const stories = document.querySelectorAll('[data-ad-rendering-role="story_message"]');

        for (const msgEl of stories) {
            const fullText = msgEl.innerText.replace(/Xem thêm|See more/g, "").trim();
            if (!fullText || storage.has(fullText)) continue;

            let base64Images = [];
            let container = msgEl.closest('.x1cy8zhl') || msgEl.parentElement.parentElement;

            if (container) {
                const photoLinks = container.querySelectorAll('a[aria-label*="image"], a[href*="/photo/"]');
                for (const link of photoLinks) {
                    const img = link.querySelector('img');
                    if (img && img.src && !img.src.includes('static')) {
                        console.log("Đang chuyển đổi ảnh...");
                        const base64 = await getBase64FromUrl(img.src);
                        if (base64) base64Images.push(base64);
                    }
                }
            }

            storage.set(fullText, {
                text: fullText,
                images: base64Images,
                imageCount: base64Images.length,
                time: new Date().toLocaleTimeString()
            });

            console.log(`%c[Lưu thành công] ${base64Images.length} ảnh đã chuyển Base64`, "color: #2ecc71");
        }
    };

    // 2. Vòng lặp chính
    let scrollCount = 0;
    const maxScrolls = 15; // Giới hạn vì Base64 tốn nhiều RAM

    while (scrollCount < maxScrolls) {
        const seeMoreBtns = document.querySelectorAll('[data-ad-rendering-role="story_message"] [role="button"]');
        seeMoreBtns.forEach(btn => {
            if (!btn.dataset.done && (btn.innerText.includes("Xem thêm") || btn.innerText.includes("See more"))) {
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                simulateRealClick(btn);
                btn.dataset.done = "true";
            }
        });

        await delay(2000); 
        await extractData(); // Đợi xử lý xong Base64 của đợt này

        window.scrollBy(0, 800);
        console.log(`Tiến trình: Cuộn lần ${scrollCount + 1}/${maxScrolls}`);
        await delay(3000); // Tăng thời gian chờ để ảnh kịp tải
        scrollCount++;

        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) break;
    }

    // 3. Xuất và tải dữ liệu dưới dạng JSON
    const finalData = Array.from(storage.values());
    console.log("HOÀN THÀNH. Đang chuẩn bị file tải về...");

    const blob = new Blob([JSON.stringify(finalData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fb_data_${Date.now()}.json`;
    a.click();

    console.log("%cTẤT CẢ DỮ LIỆU ĐÃ ĐƯỢC LƯU VÀO FILE JSON!", "color: white; background: #27ae60; padding: 10px;");
}

fbScraperToBase64();