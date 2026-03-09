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