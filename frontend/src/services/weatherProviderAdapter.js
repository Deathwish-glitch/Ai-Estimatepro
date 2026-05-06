import { getWeatherForecastApi } from "@/services/api";

export const openWeatherProviderAdapter = {
  name: "openweathermap",
  async fetchForecast(city, apiKey = "") {
    const response = await getWeatherForecastApi(city, apiKey);
    return response.data;
  },
};
