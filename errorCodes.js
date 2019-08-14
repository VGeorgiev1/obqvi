module.exports = {
  PARSE_ERROR: { error: { message: 'Parse error!', code: -32700 }, httpStatus: 500 },
  INVALID_REQUEST: { error: { message: 'Invalid Request', code: -32600 }, httpStatus: 400 },
  METHOD_NOT_FOUND: { error: { message: 'Method not found!', code: -32601 }, httpStatus: 404 },
  INVALID_PARAMS: { error: { message: 'Invalid params!', code: -32602 }, httpStatus: 500 },
  INTERNAL_ERROR: { error: { message: 'Internal error!', code: -32603 }, httpStatus: 500 }
};
