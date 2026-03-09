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