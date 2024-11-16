const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

function existsPath(pathToCheck) {
  try {
    // Sử dụng fs.statSync để kiểm tra xem đường dẫn có tồn tại không
    const stats = fs.statSync(pathToCheck);
    return true; // Trả về true nếu đường dẫn tồn tại
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // Trả về false nếu đường dẫn không tồn tại
    }
    throw err; // Ném ra lỗi khác nếu có
  }
}

function normalizeEndpoint(endpoint) {
  const normalizedPath = endpoint.replace(/\/[0-9a-fA-F]{24}(?=\?|\/|$)/g, '/:id');
  const params = new URLSearchParams(normalizedPath);
  const filters = [];
  const keyArray = Array.from(params.keys());
  const resultParams = [];
  if (params) {
    // Thêm các tham số vào mảng
    keyArray.forEach((key) => {
      const value = params.get(key);
      if (key === 'limit' || key === 'skip') {
        // Chỉ thêm '=value' cho limit và skip
        resultParams.push(`${key}=${value}`);
      } else {
        // Thêm các tham số khác mà không có '=value'
        resultParams.push(key);
      }
      const filterMatchLong = key.match(/filter\[\$(or|and|in)\]\[\d+\]\[(.+?)\]/);
      const filterMatch = key.match(/filter\[([a-zA-Z_]+)\]/);
      const keywords = ['filter', 'limit', 'selector'];

      // Kiểm tra xem có bất kỳ từ khóa nào trong query string không
      const hasKeywords = keywords.some((keyword) => key.includes(keyword));
      const hasSlash = key.includes('/');
      const hasQuestionMark = key.includes('?');
      if (!hasKeywords && hasQuestionMark) {
        const queryString = key.split('?')[1];
        const isValidString = /^[a-zA-Z]+$/.test(queryString);
        if (isValidString) {
          const fieldName = queryString;
          if (!filters.includes(fieldName)) {
            filters.push(fieldName);
          }
        }
      }
      if (!hasKeywords && !hasSlash) {
        const fieldName = key;
        if (!filters.includes(fieldName)) {
          filters.push(fieldName);
        }
      }
      if (filterMatchLong) {
        const fieldName = filterMatchLong[2]; // Lấy tên trường (name, code, etc.)

        if (!filters.includes(fieldName)) {
          filters.push(fieldName);
        }
      }
      if (filterMatch) {
        const fieldName = filterMatch[1]; // Lấy tên trường (name, code, etc.)

        if (!filters.includes(fieldName)) {
          filters.push(fieldName);
        }
      }
    });
    const keys = resultParams.join('&');
    return {
      normalizedPath: keys,
      filters,
    };
  }

  return { normalizedPath, filters: {} };
}

module.exports = {
  existsPath,
  normalizeEndpoint,
};
