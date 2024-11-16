const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const moment = require('moment');

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

const processLogLines = (lines, apiStats, startDate, endDate) => {
  const endPointRegex = /(OPTIONS|GET|POST|PUT|DELETE)\s(\/[^\s]*)\s.*?(\d+\.\d+)\sms/;
  const timeRegex = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/;
  let start = null;
  let end = null;

  lines.forEach((line) => {
    const matchTime = line.match(timeRegex);
    if (matchTime) {
      const logDate = moment(matchTime[1]);

      // Thiết lập start nếu chưa có
      if (!start) {
        start = logDate;
      }
      // Cập nhật end mỗi khi tìm thấy một logDate
      end = logDate; // Cập nhật end tới logDate mới nhất
    }
  });

  // Nếu không có startDate và endDate từ yêu cầu
  if (!startDate && !endDate) {
    // In ra toàn bộ log
    lines.forEach((line) => {
      const match = line.match(endPointRegex);
      if (match) {
        const method = match[1];
        const { normalizedPath, filters = [] } = normalizeEndpoint(match[2]);
        const time = parseFloat(match[3]);
        const key = `${method} ${normalizedPath}`;
        if (!apiStats[key]) {
          apiStats[key] = { count: 0, totalTime: 0, details: {} };
        }
        apiStats[key].count += 1;
        apiStats[key].totalTime += time;

        // Cập nhật details với filters
        filters.forEach((filter) => {
          if (!apiStats[key].details[filter]) {
            apiStats[key].details[filter] = 0;
          }
        });
      }
    });
  } else {
    // Nếu có startDate hoặc endDate, lọc theo khoảng thời gian
    start = startDate ? moment(startDate) : start;
    end = endDate ? moment(endDate) : end;

    lines.forEach((line) => {
      const matchTime = line.match(timeRegex);
      if (matchTime) {
        const logDate = moment(matchTime[1]);

        // Kiểm tra xem logDate có nằm trong khoảng thời gian không
        if (logDate.isSameOrAfter(start) && logDate.isSameOrBefore(end)) {
          const match = line.match(endPointRegex);
          if (match) {
            const method = match[1];
            const { normalizedPath, filters = [] } = normalizeEndpoint(match[2]);
            const time = parseFloat(match[3]);
            const key = `${method} ${normalizedPath}`;

            if (!apiStats[key]) {
              apiStats[key] = { count: 0, totalTime: 0, details: {} };
            }

            apiStats[key].count += 1;
            apiStats[key].totalTime += time;

            // Cập nhật details với filters
            filters.forEach((filter) => {
              if (!apiStats[key].details[filter]) {
                apiStats[key].details[filter] = 0;
              }
            });
          }
        }
      }
    });
  }
};

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
  processLogLines,
};
