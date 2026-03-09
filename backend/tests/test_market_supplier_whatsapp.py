import os
import uuid

import pytest
import requests

# Module: Local market intelligence and supplier ingestion coverage
# Feature: Market settings, trends, contractor comparison, WhatsApp parser, project compatibility

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


def test_market_settings_save_and_fetch(api_client, api_base_url):
    update_response = api_client.post(
        f"{api_base_url}/api/market-rates/settings",
        json={"refresh_frequency": "daily"},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["refresh_frequency"] == "daily"

    get_response = api_client.get(f"{api_base_url}/api/market-rates/settings")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["refresh_frequency"] == "daily"


def test_supplier_submission_persists_and_is_listed(api_client, api_base_url):
    supplier_name = f"TEST_Supplier_{uuid.uuid4().hex[:8]}"
    payload = {
        "supplier_name": supplier_name,
        "location": "Nashik",
        "prices": [
            {"material": "Cement", "rate": 401, "unit": "bag"},
            {"material": "Steel", "rate": 67, "unit": "kg"},
        ],
    }

    create_response = api_client.post(f"{api_base_url}/api/suppliers/rates", json=payload)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["supplier_name"] == supplier_name
    assert created["source_type"] == "supplier_manual"
    assert len(created["prices"]) == 2

    list_response = api_client.get(f"{api_base_url}/api/suppliers/rates?limit=100")
    assert list_response.status_code == 200
    records = list_response.json()
    matched = [record for record in records if record["id"] == created["id"]]
    assert len(matched) == 1
    assert matched[0]["supplier_name"] == supplier_name


def test_market_rates_source_count_updates_after_manual_source(api_client, api_base_url):
    unique_reference = f"TEST_source_{uuid.uuid4().hex[:8]}"
    source_payload = [
        {
            "source_type": "website",
            "supplier_name": "TEST_Website",
            "location": "Nashik",
            "material": "Cement",
            "rate": 399,
            "unit": "bag",
            "source_reference": unique_reference,
        }
    ]
    create_source_response = api_client.post(f"{api_base_url}/api/market-rates/sources", json=source_payload)
    assert create_source_response.status_code == 200
    created_sources = create_source_response.json()
    assert len(created_sources) == 1
    assert created_sources[0]["source_reference"] == unique_reference

    rates_response = api_client.get(f"{api_base_url}/api/market-rates?refresh_frequency=weekly")
    assert rates_response.status_code == 200
    rates_data = rates_response.json()
    cement_rows = [item for item in rates_data["items"] if item["material"] == "Cement"]
    assert len(cement_rows) == 1
    assert isinstance(cement_rows[0]["source_count"], int)
    assert cement_rows[0]["source_count"] >= 1


def test_estimate_contains_local_rates_comparison_and_optimized_schedule(api_client, api_base_url):
    payload = {
        "plot_size_sqft": 1600,
        "built_up_area_sqft": 1100,
        "floors": 2,
        "building_type": "Standard",
        "location": "Nashik",
        "labour_cost_adjustment_pct": 3,
        "material_price_variation_pct": 2,
        "refresh_frequency": "weekly",
    }
    response = api_client.post(f"{api_base_url}/api/estimate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data["local_market_rates"], list)
    assert len(data["local_market_rates"]) >= 4
    assert isinstance(data["optimized_schedule"], list)
    assert len(data["optimized_schedule"]) >= 3
    assert "contractor_comparison" in data
    assert isinstance(data["contractor_comparison"]["rows"], list)
    assert len(data["contractor_comparison"]["rows"]) == 3


def test_contractor_comparison_manual_input_overrides_baseline(api_client, api_base_url):
    payload = {
        "plot_size_sqft": 1600,
        "built_up_area_sqft": 1000,
        "floors": 1,
        "building_type": "Basic",
        "location": "Nashik",
        "labour_cost_adjustment_pct": 0,
        "material_price_variation_pct": 0,
        "refresh_frequency": "weekly",
        "contractor_quote": {
            "material_cost": 800000,
            "labour_cost": 300000,
            "total_cost": 1250000,
        },
    }

    response = api_client.post(f"{api_base_url}/api/estimate", json=payload)
    assert response.status_code == 200
    data = response.json()
    comparison = data["contractor_comparison"]

    assert comparison["contractor_total"] == 1250000
    material_row = [row for row in comparison["rows"] if row["category"] == "Material"][0]
    labour_row = [row for row in comparison["rows"] if row["category"] == "Labour"][0]
    assert material_row["contractor_cost"] == 800000
    assert labour_row["contractor_cost"] == 300000


def test_price_trend_endpoint_returns_points_after_rate_aggregation(api_client, api_base_url):
    refresh_response = api_client.get(f"{api_base_url}/api/market-rates?refresh_frequency=daily")
    assert refresh_response.status_code == 200

    trend_response = api_client.get(f"{api_base_url}/api/market-rates/trends?material=Cement&days=30")
    assert trend_response.status_code == 200
    trend_data = trend_response.json()
    assert trend_data["material"] == "Cement"
    assert isinstance(trend_data["points"], list)
    assert len(trend_data["points"]) >= 1
    assert "avg_rate" in trend_data["points"][0]


def test_whatsapp_structured_payload_ingestion_updates_supplier_rates(api_client, api_base_url):
    phone_id = f"91{uuid.uuid4().int % 10**10:010d}"
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": phone_id,
                                    "type": "text",
                                    "text": {
                                        "body": "RATE UPDATE\nCement 410\nSteel 68\nSand 3600\nBrick 11"
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }

    webhook_response = api_client.post(f"{api_base_url}/api/whatsapp/webhook", json=payload)
    assert webhook_response.status_code == 200
    webhook_data = webhook_response.json()
    assert webhook_data["status"] == "ok"
    assert webhook_data["processed_updates"] >= 1

    list_response = api_client.get(f"{api_base_url}/api/suppliers/rates?limit=200")
    assert list_response.status_code == 200
    records = list_response.json()
    wa_name = f"WA-{phone_id}"
    matched = [record for record in records if record["supplier_name"] == wa_name]
    assert len(matched) >= 1
    assert len(matched[0]["prices"]) >= 1


def test_saved_projects_list_endpoint_schema_compatibility(api_client, api_base_url):
    response = api_client.get(f"{api_base_url}/api/projects?limit=20")
    assert response.status_code == 200
    projects = response.json()
    assert isinstance(projects, list)
    if projects:
        first = projects[0]
        assert "id" in first
        assert "project_name" in first
        assert "input_data" in first
        assert "result" in first
        assert "local_market_rates" in first["result"]
