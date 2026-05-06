import { formatForecastResponse } from "@/services/forecastFormatter";
import { openWeatherProviderAdapter } from "@/services/weatherProviderAdapter";

export const weatherService = {
  provider: openWeatherProviderAdapter,
  async getDailyForecast(city, apiKey = "") {
    const raw = await this.provider.fetchForecast(city, apiKey);
    return formatForecastResponse(raw);
  },
};
