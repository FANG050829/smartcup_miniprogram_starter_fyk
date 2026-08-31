// AI 对话改为微信云函数调用。
// 默认使用 wx.cloud.init() 当前选择的云环境；如果真机或开发者工具提示
// "env status is isolated"，可把 LLM_CLOUD_ENV 改成自己的云环境 ID。
var LLM_CLOUD_FUNCTION_NAME = "llmProxy";
var LLM_CLOUD_ENV = "cloud1-d6grh9jgl3278f657";
module.exports = {
  LLM_CLOUD_FUNCTION_NAME: LLM_CLOUD_FUNCTION_NAME,
  LLM_CLOUD_ENV: LLM_CLOUD_ENV
};