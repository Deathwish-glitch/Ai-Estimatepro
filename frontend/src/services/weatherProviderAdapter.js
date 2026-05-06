import { getWeatherForecastApi } from "@/services/api";

export const openWeatherProviderAdapter = {
  name: "openweathermap",
  async fetchForecast(city) {
    const response = await getWeatherForecastApi(city);
    return response.data;
  },
};