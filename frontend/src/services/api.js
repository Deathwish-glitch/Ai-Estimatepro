import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const apiClient = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

export const calculateEstimateApi = (payload) => apiClient.post("/estimate", payload);
export const saveProjectApi = (payload) => apiClient.post("/projects", payload);
export const getProjectsApi = (limit = 20) => apiClient.get(`/projects?limit=${limit}`);
export const createChatSessionApi = () => apiClient.post("/chat/session");
export const getChatHistoryApi = (sessionId, limit = 30) => apiClient.get(`/chat/history/${sessionId}?limit=${limit}`);
export const sendChatMessageApi = (payload) => apiClient.post("/chat/message", payload);

export const getMarketRateSettingsApi = () => apiClient.get("/market-rates/settings");
export const updateMarketRateSettingsApi = (payload) => apiClient.post("/market-rates/settings", payload);
export const getMarketRatesApi = (refreshFrequency) => apiClient.get(`/market-rates?refresh_frequency=${refreshFrequency}`);
export const createMarketSourceEntriesApi = (payload) => apiClient.post("/market-rates/sources", payload);
export const scrapeMarketRatesApi = (payload) => apiClient.post("/market-rates/scrape", payload);
export const getMarketTrendApi = (material, days = 90) => apiClient.get(`/market-rates/trends?material=${encodeURIComponent(material)}&days=${days}`);

export const submitSupplierRatesApi = (payload) => apiClient.post("/suppliers/rates", payload);
export const getSupplierRatesApi = (limit = 50) => apiClient.get(`/suppliers/rates?limit=${limit}`);

export const getWhatsappStatusApi = () => apiClient.get("/whatsapp/status");

export const analyzeDrawingApi = (formData) =>
  apiClient.post("/drawing-analyzer/analyze", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const getDrawingAnalysisHistoryApi = (limit = 20) =>
  apiClient.get(`/drawing-analyzer/history?limit=${limit}`);

export const compareDrawingAnalysesApi = (baseAnalysisId, targetAnalysisId) =>
  apiClient.get(
    `/drawing-analyzer/compare?base_analysis_id=${encodeURIComponent(baseAnalysisId)}&target_analysis_id=${encodeURIComponent(targetAnalysisId)}`,
  );

export const createQsProjectApi = (payload) => apiClient.post("/qs/projects", payload);
export const listQsProjectsApi = (limit = 50) => apiClient.get(`/qs/projects?limit=${limit}`);
export const createQsProjectVersionApi = (projectId, payload) => apiClient.post(`/qs/projects/${projectId}/versions`, payload);
export const listQsProjectVersionsApi = (projectId) => apiClient.get(`/qs/projects/${projectId}/versions`);

export const upsertQsMeasurementsApi = (projectVersionId, payload) =>
  apiClient.post(`/qs/versions/${projectVersionId}/measurements`, payload);
export const listQsMeasurementsApi = (projectVersionId) =>
  apiClient.get(`/qs/versions/${projectVersionId}/measurements`);

export const upsertQsBoqApi = (projectVersionId, payload) => apiClient.post(`/qs/versions/${projectVersionId}/boq`, payload);
export const listQsBoqApi = (projectVersionId) => apiClient.get(`/qs/versions/${projectVersionId}/boq`);

export const upsertMaterialRatesApi = (payload) => apiClient.post("/qs/rates/material", payload);
export const listMaterialRatesApi = (city) => apiClient.get(`/qs/rates/material${city ? `?city=${encodeURIComponent(city)}` : ""}`);
export const upsertLabourRatesApi = (payload) => apiClient.post("/qs/rates/labour", payload);
export const listLabourRatesApi = (city) => apiClient.get(`/qs/rates/labour${city ? `?city=${encodeURIComponent(city)}` : ""}`);

export const createQsExportLogApi = (payload) => apiClient.post("/qs/export-logs", payload);
export const listQsExportLogsApi = (projectVersionId) =>
  apiClient.get(`/qs/export-logs${projectVersionId ? `?project_version_id=${encodeURIComponent(projectVersionId)}` : ""}`);

export const getWeatherForecastApi = (city) => apiClient.get(`/weather/forecast?city=${encodeURIComponent(city)}`);