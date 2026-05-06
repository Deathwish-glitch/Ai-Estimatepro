export const formatForecastResponse = (payload) => {
  const safePayload = payload || {};
  return {
    city: safePayload.city || "Nashik",
    hasApiKey: Boolean(safePayload.has_api_key),
    provider: safePayload.provider || "openweathermap",
    message: safePayload.message || "Weather data ready",
    days: (safePayload.forecast_days || []).map((day) => ({
      date: day.date,
      minTempC: Number(day.min_temp_c || 0),
      maxTempC: Number(day.max_temp_c || 0),
      avgHumidity: Number(day.avg_humidity || 0),
      rainfallMm: Number(day.rainfall_mm || 0),
      avgWindMps: Number(day.avg_wind_mps || 0),
      description: day.description || "clear",
    })),
  };
};