import os

import pytest
import requests

# Module: Weather integration fallback and base API availability
# Feature: OPENWEATHER_API_KEY-missing graceful behavior

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="session")
def api_base_url():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def test_api_root_available(api_client, api_base_url):
    response = api_client.get(f"{api_base_url}/api/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "AI Estimate Pro API is running"


def test_weather_forecast_fallback_without_openweather_key(api_client, api_base_url):
    response = api_client.get(f"{api_base_url}/api/weather/forecast", params={"city": "Nashik"})
    assert response.status_code == 200

    data = response.json()
    assert data["city"] == "Nashik"
    assert data["provider"] == "openweathermap"
    assert data["has_api_key"] is False
    assert isinstance(data["forecast_days"], list)
    assert len(data["forecast_days"]) == 0
    assert "OPENWEATHER_API_KEY" in data["message"]
