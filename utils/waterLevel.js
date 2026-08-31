var WATER_LEVEL_STEP_ML = 50;
var WATER_LEVEL_MAX_ML = 500;

function normalizeWaterMl(value) {
  var raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  var stepped = Math.round(raw / WATER_LEVEL_STEP_ML) * WATER_LEVEL_STEP_ML;
  if (stepped <= 0) return 0;
  if (stepped >= WATER_LEVEL_MAX_ML) return WATER_LEVEL_MAX_ML;
  return stepped;
}
module.exports = {
  WATER_LEVEL_STEP_ML: WATER_LEVEL_STEP_ML,
  WATER_LEVEL_MAX_ML: WATER_LEVEL_MAX_ML,
  normalizeWaterMl: normalizeWaterMl
};