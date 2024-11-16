const unzipper = require('unzipper');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { PDFDocument } = require('pdf-lib');
const XLSX = require('xlsx');
const path = require('path');
const fsExtra = require('fs-extra');

function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return str;
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  str = str.replace(/Đ/g, 'D');
  // Some system encode vietnamese combining accent as individual utf-8 characters
  // Một vài bộ encode coi các dấu mũ, dấu chữ như một kí tự riêng biệt nên thêm hai dòng này
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ''); // ̀ ́ ̃ ̉ ̣  huyền, sắc, ngã, hỏi, nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ''); // ˆ ̆ ̛  Â, Ê, Ă, Ơ, Ư
  // Remove extra spaces
  // Bỏ các khoảng trắng liền nhau
  str = str.replace(/ + /g, ' ');
  str = str.trim();
  // Remove punctuations
  // Bỏ dấu câu, kí tự đặc biệt
  // str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|{|}|\||\\/g, ' ');
  return str.toLowerCase();
}

// xóa folder trong project
async function deleteFolderAndContent(folderPath) {
  try {
    await fsPromises.rm(folderPath, { recursive: true, force: true });
    console.log(`Đã xóa file: ${folderPath}`);
  } catch (err) {
    console.error('Error deleting file:', err);
  }
}

/**
 * Kiểm tra xem đường dẫn có tồn tại hay không
 * @param {string} pathToCheck - Đường dẫn cần kiểm tra
 * @returns {boolean} - True nếu đường dẫn tồn tại, False nếu không tồn tại
 */
function existsPath(pathToCheck) {
  try {
    // Sử dụng fs.statSync để kiểm tra xem đường dẫn có tồn tại không
    const stats = fs.statSync(pathToCheck);
    return true; // Trả về true nếu đường dẫn tồn tại
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // Trả về false nếu đường dẫn không tồn tại
    } else {
      throw err; // Ném ra lỗi khác nếu có
    }
  }
}

function readExcelDataAsArray(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    return data;
  } catch (error) {
    console.error('Error reading Excel buffer:', error.message);
    return null;
  }
}

async function checkForSingleZipAndExcel(folderPath) {
  try {
    const files = await fsExtra.readdir(folderPath); // Đọc danh sách các file trong thư mục

    let zipFile = null;
    let excelFile = null;

    // Duyệt qua các file để tìm file ZIP và file Excel
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = await fsExtra.stat(filePath);

      // Kiểm tra nếu là file và định dạng của nó
      if (stat.isFile()) {
        if (path.extname(file) === '.zip') {
          if (zipFile) {
            throw new Error('Thư mục chứa nhiều hơn một file ZIP.');
          }
          zipFile = filePath;
        } else if (['.xlsx', '.xls'].includes(path.extname(file))) {
          if (excelFile) {
            throw new Error('Thư mục chứa nhiều hơn một file Excel.');
          }
          excelFile = filePath;
        }
      }
    }

    // Kiểm tra kết quả và trả về thông tin
    if (zipFile && excelFile) {
      return { zipFile, excelFile };
    } else if (!zipFile && !excelFile) {
      return null;
    } else if (!zipFile && excelFile) {
      return { excelFile };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Đã xảy ra lỗi:', error);
    throw error;
  }
}

/**
 * lấy những file được tạo mới
 * @param {Array} dataExcel Mảng dữ liệu đọc từ excel
 * @param {Array} dataAttachments Mảng dữ liệu đọc từ file zip đính kèm
 * @param {*} config Cấu hình tùy chọn
 * @returns trả về những bản ghi mới từ file excel
 */
function hasFileNameInArray(fileInfo, fileName, id) {
  return fileInfo
    .filter((file) => fileName.includes(file.name))
    .map((file) => ({
      ...file,
      id_doc: id,
    }));
}

module.exports = {
  removeVietnameseTones,
  existsPath,
  deleteFolderAndContent,
  readExcelDataAsArray,
  checkForSingleZipAndExcel,
  hasFileNameInArray,
};
