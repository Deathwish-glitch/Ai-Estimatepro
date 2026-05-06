import { formatForecastResponse } from "@/services/forecastFormatter";
import { openWeatherProviderAdapter } from "@/services/weatherProviderAdapter";

export const weatherService = {
  provider: openWeatherProviderAdapter,
  async getDailyForecast(city) {
    const raw = await this.provider.fetchForecast(city);
    return formatForecastResponse(raw);
  },
};