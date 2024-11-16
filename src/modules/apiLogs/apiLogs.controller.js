const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const fsPromises = require('fs').promises;
const moment = require('moment');
const service = require('./apiLogs.service');
require('dotenv').config();

const apiLogs = async (req, res, next) => {
  try {
    const files = req.files;
    const pathLogs = path.join(__dirname, '..', '..', 'files');
    const apiStats = {};
    const { startDate, endDate } = req.body;
    const validateDate =
      (startDate && !moment(startDate, 'YYYY-MM-DD', true).isValid()) ||
      (endDate && !moment(endDate, 'YYYY-MM-DD', true).isValid());
    if (validateDate) {
      return res.status(400).json('Ngày bắt đầu và kết thúc phải có dạng YYYY/MM/DD');
    }
    let start = null;
    let end = null;

    const checkPathLogs = service.existsPath(pathLogs);
    if (!checkPathLogs) {
      await fsPromises.mkdir(pathLogs);
    }
    files.forEach((file) => {
      const data = fs.readFileSync(path.join(pathLogs, file.filename), 'utf8');
      const lines = data.split('\n');
      const endPointRegex = /(OPTIONS|GET|POST|PUT|DELETE)\s(\/[^\s]*)\s.*?(\d+\.\d+)\sms/;
      const timeRegex = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/;

      lines.forEach((line) => {
        const matchTime = line.match(timeRegex);
        if (matchTime) {
          const logDate = moment(matchTime[1]); // Lấy thời gian từ log và chuyển đổi thành Moment.js

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
            const { normalizedPath, filters = [] } = service.normalizeEndpoint(match[2]);
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
            const logDate = moment(matchTime[1]); // Lấy thời gian từ log

            // Kiểm tra xem logDate có nằm trong khoảng thời gian không
            if (logDate.isSameOrAfter(start) && logDate.isSameOrBefore(end)) {
              const match = line.match(endPointRegex);
              if (match) {
                const method = match[1];
                const { normalizedPath, filters = {} } = service.normalizeEndpoint(match[2]);
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

      // Xóa file log sau khi xử lý
      try {
        fs.unlinkSync(path.join(pathLogs, file.filename));
      } catch (err) {
        console.error(`File error: ${err.message}`);
        return;
      }
    });

    const totalRequests = Object.values(apiStats).reduce((acc, stat) => acc + stat.count, 0);

    const result = Object.entries(apiStats)
      .map(([endpoint, { count, totalTime, details }]) => {
        const avgTime = count > 0 ? (totalTime / count).toFixed(2) : 0;
        const percentage = ((count / totalRequests) * 100).toFixed(3);

        // Phân tích tốc độ của api
        let description = 'Very Slow';
        if (avgTime < Number(process.env.FAST)) {
          description = 'Fast';
        } else if (avgTime >= Number(process.env.FAST) && avgTime < Number(process.env.MODERATE)) {
          description = 'Moderate';
        } else if (avgTime >= Number(process.env.MODERATE) && avgTime < Number(process.env.SLOW)) {
          description = 'Slow';
        }
        const keyArray = Object.keys(details);
        // Tạo chi tiết filter
        const detailsString = keyArray.join(',\n');

        return {
          Endpoint: endpoint,
          Requests: count,
          Percentage: `${percentage}%`,
          AverageTime: `${avgTime} ms`,
          Description: description,
          Details: detailsString || 'N/A',
        };
      })
      .sort((a, b) => parseFloat(b.Percentage) - parseFloat(a.Percentage));

    // Tạo workbook và worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('API Stats');

    // Thêm tiêu đề
    worksheet.columns = [
      { header: 'Endpoint', key: 'Endpoint', width: 50 },
      { header: 'Requests', key: 'Requests', width: 10 },
      { header: 'Percentage', key: 'Percentage', width: 15 },
      { header: 'AverageTime', key: 'AverageTime', width: 15 },
      { header: 'Description', key: 'Description', width: 20 },
      { header: 'Details', key: 'Details', width: 50 },
    ];
    worksheet.getColumn('Details').alignment = { wrapText: true };
    worksheet.getColumn('Endpoint').alignment = { wrapText: true };

    // Thêm dữ liệu và định dạng màu
    result.forEach((item) => {
      const row = worksheet.addRow(item);

      if (item.Description === 'Very Slow') {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF0000' },
          };
          cell.font = { color: { argb: 'FFFFFFFF' } };
        });
      } else if (item.Description === 'Slow') {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD700' },
          };
          cell.font = { color: { argb: '000000' } };
        });
      }
    });

    const filePath = path.join(__dirname, 'api-stats.xlsx');
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, 'api-stats.xlsx', (err) => {
      if (err) {
        fs.unlinkSync(filePath);
        console.error('Error sending file:', err);
        res.status(500).json({ message: 'Error downloading file' });
      }
      console.log('Tải thành công file excel');
      fs.unlinkSync(filePath);
    });
  } catch (e) {
    return res.status(400).json(e);
  }
};

module.exports = { apiLogs };
