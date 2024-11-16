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
    if ((startDate || endDate) && validateDate) {
      console.log('Ngày bắt đầu và kết thúc phải có dạng YYYY/MM/DD');
      return;
    }

    const checkPathLogs = service.existsPath(pathLogs);
    if (!checkPathLogs) {
      await fsPromises.mkdir(pathLogs);
    }
    // phân tích từng file tải lên
    files.forEach((file) => {
      const data = fs.readFileSync(path.join(pathLogs, file.filename), 'utf8');
      const lines = data.split('\n');

      // Gọi hàm để xử lý các dòng log
      service.processLogLines(lines, apiStats, startDate, endDate);

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
      }
      console.log('Tải thành công file excel');
      fs.unlinkSync(filePath);
    });
  } catch (e) {
    console.log(e);
    return;
  }
};

module.exports = { apiLogs };
