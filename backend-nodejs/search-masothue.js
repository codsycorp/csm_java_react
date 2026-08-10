// search-masothue.js
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { URLSearchParams } = require('url');

function generateRandomR(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function fetchMasothueSearch(query) {
  const r = generateRandomR();

  // 1. Gửi request để lấy token
  const tokenRes = await fetch('https://masothue.com/Ajax/Token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Node.js)'
    },
    body: new URLSearchParams({ r })
  });

  const rawText = await tokenRes.text();

  // Kiểm tra nếu trả về HTML thì báo lỗi
  if (rawText.startsWith('<!DOCTYPE')) {
    console.error("Server trả về HTML thay vì JSON. Có thể bị chặn.");
    console.log(rawText);
    return;
  }

  let token;
  try {
    const json = JSON.parse(rawText);
    token = json.token;
  } catch (e) {
    console.error("Không parse được JSON:", rawText);
    return;
  }

  if (!token) {
    console.error("Không lấy được token.");
    return;
  }

  // 2. Gửi request tìm kiếm với token
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://masothue.com/Search/?q=${encodedQuery}&type=auto&token=${token}&force-search=1`;
  console.log(searchUrl);
  const searchRes = await fetch(searchUrl, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Node.js)'
    }
  });

  const searchText = await searchRes.text();
    console.log(searchText);
  if (searchText.startsWith('<!DOCTYPE')) {
    console.error("Search trả về HTML. Có thể bị chặn.");
    console.log(extractDataFromHTML(searchText));
    return;
  }

  try {
    const results = JSON.parse(searchText);
    console.log("🔍 Kết quả tìm kiếm:", results);
  } catch (e) {
    console.error("Không parse được kết quả JSON:", searchText);
  }
}

// Hàm trích xuất dữ liệu từ HTML
function extractDataFromHTML(html) {
  const $ = cheerio.load(html);

  // Trường hợp: Lấy tên công ty, mã số thuế, người đại diện và địa chỉ
  $('div.tax-listing div[data-prefetch]').each(function (index, element) {
    const companyName = $(this).find('h3 a').text().trim();
    const taxId = $(this).find('i.fa-hashtag').next().text().replace('Mã số thuế:', '').trim();
    const representative = $(this).find('i.fa-user').next().find('em a').text().trim();
    const address = $(this).find('address').text().trim();

    console.log(`Công ty ${index + 1}: ${companyName}`);
    console.log(`Mã số thuế: ${taxId}`);
    console.log(`Người đại diện: ${representative}`);
    console.log(`Địa chỉ: ${address}`);
    console.log('--------------------------------');
  });
}

// Gọi thử
fetchMasothueSearch("CÔNG TY CỔ PHẦN CODSY");
