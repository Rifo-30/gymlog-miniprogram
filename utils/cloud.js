// Fill this with the Cloud Development environment ID shown in WeChat DevTools.
// Leave it empty to use the default environment selected by the developer tool.
const CLOUD_ENV_ID = 'cloud1-d7gchkgfdaa637a64';

let initialized = false;

function available() {
  return typeof wx !== 'undefined' && !!wx.cloud;
}

function init() {
  if (!available()) {
    throw new Error('当前基础库不支持云开发');
  }
  if (!initialized) {
    const options = { traceUser: true };
    if (CLOUD_ENV_ID) options.env = CLOUD_ENV_ID;
    wx.cloud.init(options);
    initialized = true;
  }
}

async function callFunction(name, data) {
  init();
  const result = await wx.cloud.callFunction({
    name,
    data: data || {}
  });
  return result.result;
}

async function uploadFile(cloudPath, filePath) {
  init();
  const result = await wx.cloud.uploadFile({
    cloudPath,
    filePath
  });
  return result.fileID;
}

async function getTempFileURL(fileID) {
  init();
  const result = await wx.cloud.getTempFileURL({
    fileList: [fileID]
  });
  const item = result.fileList && result.fileList[0];
  if (!item || !item.tempFileURL) {
    throw new Error('无法获取头像地址');
  }
  return item.tempFileURL;
}

module.exports = {
  CLOUD_ENV_ID,
  available,
  init,
  callFunction,
  uploadFile,
  getTempFileURL
};
