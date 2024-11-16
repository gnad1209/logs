const mongod_log = require("./mongodLog.model");

const createPipelineNsCounts = (totalRecords) => {
  try {
    return [
      {
        $group: {
          _id: "$attr.ns",
          count: { $sum: 1 },
          codes: {
            $push: {
              $cond: [
                { $ifNull: ["$attr.command.filter.code", false] },
                "$attr.command.filter.code",
                null,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          ns: "$_id",
          count: 1,
          codes: {
            $filter: {
              input: "$codes",
              as: "code",
              cond: { $ne: ["$$code", null] },
            },
          },
          percentage: {
            $multiply: [
              { $divide: ["$count", { $literal: totalRecords }] },
              100,
            ],
          },
        },
      },
    ];
  } catch (error) {
    console.log("error.createPipelineNsCounts", error.message);
    return [];
  }
};
const createPipelineMsgCounts = (totalRecords) => {
  try {
    return [
      {
        $group: {
          _id: "$msg",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          msg: "$_id",
          count: 1,
          percentage: {
            $multiply: [{ $divide: ["$count", totalRecords] }, 100],
          },
        },
      },
    ];
  } catch (error) {
    console.log("error.createPipelineMsgCounts", error.message);
    return [];
  }
};
const createPipelineStatistics = () => {
  try {
    return [
      {
        $group: {
          _id: null,
          commandTypes: { $addToSet: "$attr.type" },
          totalCount: { $sum: 1 },
          s: { $addToSet: "$s" },
          c: { $addToSet: "$c" },
          ctx: { $addToSet: "$ctx" },
          msg: { $addToSet: "$msg" },
          uniqueCollections: { $addToSet: "$attr.ns" },
          planSummaries: { $addToSet: "$attr.planSummary" },
          protocols: { $addToSet: "$attr.protocol" },
        },
      },
      {
        $project: {
          _id: 0,
          commandTypes: 1,
          totalCount: 1,
          s: 1,
          c: 1,
          ctx: 1,
          msg: 1,
          uniqueCollections: 1,
          planSummaries: 1,
          protocols: 1,
        },
      },
    ];
  } catch (error) {
    console.log("error.createPipelineStatistics", error.message);
    return [];
  }
};
const createPipelineResults = (msg, ns) => {
  try {
    return [
      {
        $match: {
          msg: msg,
          "attr.ns": ns,
        },
      },
      {
        $project: {
          _id: 1,
          code: { $ifNull: ["$attr.command.filter.code", null] }, // Lấy code từ filter, nếu không có thì trả về null
        },
      },
      {
        $group: {
          _id: null, // Nhóm tất cả các kết quả
          totalCodes: { $sum: { $cond: [{ $ne: ["$code", null] }, 1, 0] } }, // Đếm số lượng code không null
          totalRecords: { $sum: 1 }, // Đếm tổng số bản ghi
        },
      },
      {
        $project: {
          _id: 0,
          totalCodes: 1,
          totalRecords: 1,
          percentage: {
            $cond: {
              if: { $gt: ["$totalRecords", 0] }, // Kiểm tra nếu tổng số bản ghi lớn hơn 0
              then: {
                $multiply: [{ $divide: ["$totalCodes", "$totalRecords"] }, 100],
              }, // Tính tỷ lệ phần trăm
              else: 0, // Nếu không, tỷ lệ là 0
            },
          },
        },
      },
    ];
  } catch (error) {
    console.log("error.createPipelineStatistics", error.message);
    return [];
  }
};
const createPipelineResultsTotal = (msg, ns) => {
  try {
    return [
      {
        $match: {
          msg: msg,
          "attr.ns": ns,
        },
      },
      {
        $project: {
          _id: 1,
          filter: "$attr.command.filter",
        },
      },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          filterFields: {
            $push: {
              $objectToArray: {
                $ifNull: ["$filter", {}],
              },
            },
          },
        },
      },
      {
        $unwind: "$filterFields",
      },
      {
        $unwind: "$filterFields",
      },
      {
        $group: {
          _id: "$filterFields.k",
          count: { $sum: 1 }, // Đếm số lượng
          data: { $first: "$filterFields.v" }, // Lưu giá trị đầu tiên
        },
      },
      {
        $group: {
          _id: null,
          totalRecords: { $first: "$totalRecords" },
          filterFields: {
            $push: {
              k: "$_id",
              v: "$data",
              count: "$count",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRecords: 1,
          filterFields: {
            $arrayToObject: {
              $map: {
                input: "$filterFields",
                as: "field",
                in: {
                  k: { $concat: ["attr.command.filter.", "$$field.k"] }, // Tạo key
                  v: {
                    data: "$$field.v", // Dữ liệu
                    count: "$$field.count", // Số lượng
                    percentage: {
                      $cond: [
                        { $gt: ["$totalRecords", 0] },
                        {
                          $multiply: [
                            { $divide: ["$$field.count", "$totalRecords"] }, // Tính phần trăm
                            100,
                          ],
                        },
                        0, // Nếu totalRecords = 0, trả về 0%
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    ];
  } catch (error) {
    console.log("error.createPipelineStatistics", error.message);
    return [];
  }
};

module.exports = {
  createPipelineNsCounts,
  createPipelineMsgCounts,
  createPipelineStatistics,
  createPipelineResults,
  createPipelineResultsTotal,
};
