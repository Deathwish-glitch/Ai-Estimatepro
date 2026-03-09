import os
import uuid

import pytest
import requests

# Module: Core API health and estimate generation coverage
# Feature: Projects persistence compatibility and chat workflow coverage

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


def test_api_root_health(api_client, api_base_url):
    response = api_client.get(f"{api_base_url}/api/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "AI Estimate Pro API is running"


def test_estimate_generation_returns_detailed_materials_and_schedule(api_client, api_base_url):
    payload = {
        "plot_size_sqft": 1800,
        "built_up_area_sqft": 1200,
        "floors": 2,
        "building_type": "Standard",
        "location": "Tier 2 City",
        "labour_cost_adjustment_pct": 5,
        "material_price_variation_pct": 3,
    }
    response = api_client.post(f"{api_base_url}/api/estimate", json=payload)

    assert response.status_code == 200
    data = response.json()

    assert data["project_area_sqft"] == 2400
    assert isinstance(data["detailed_materials"], list)
    assert len(data["detailed_materials"]) >= 20
    first_material = data["detailed_materials"][0]
    assert first_material["category"]
    assert first_material["name"]
    assert isinstance(first_material["quantity"], (int, float))
    assert first_material["note"]

    assert isinstance(data["schedule"], list)
    assert len(data["schedule"]) >= 6
    first_phase = data["schedule"][0]
    assert first_phase["phase"]
    assert isinstance(first_phase["tasks"], list)
    assert len(first_phase["tasks"]) > 0
    assert first_phase["milestone"]
    assert isinstance(first_phase["expected_crew_size"], int)

    assert isinstance(data["suggestions"], list)
    assert len(data["suggestions"]) >= 3


def test_save_project_then_list_contains_saved_project(api_client, api_base_url):
    unique_name = f"TEST_Project_{uuid.uuid4().hex[:8]}"
    input_data = {
        "plot_size_sqft": 1500,
        "built_up_area_sqft": 1000,
        "floors": 1,
        "building_type": "Basic",
        "location": "Rural",
        "labour_cost_adjustment_pct": 0,
        "material_price_variation_pct": 0,
    }

    create_response = api_client.post(
        f"{api_base_url}/api/projects",
        json={"project_name": unique_name, "input_data": input_data},
    )
    assert create_response.status_code == 200

    created = create_response.json()
    assert created["project_name"] == unique_name
    assert created["input_data"]["built_up_area_sqft"] == 1000
    assert "result" in created
    project_id = created["id"]

    list_response = api_client.get(f"{api_base_url}/api/projects?limit=50")
    assert list_response.status_code == 200
    projects = list_response.json()
    assert isinstance(projects, list)
    matched = [project for project in projects if project["id"] == project_id]
    assert len(matched) == 1
    assert matched[0]["project_name"] == unique_name


def test_get_project_by_id_returns_saved_payload(api_client, api_base_url):
    unique_name = f"TEST_GetById_{uuid.uuid4().hex[:8]}"
    input_data = {
        "plot_size_sqft": 1400,
        "built_up_area_sqft": 950,
        "floors": 1,
        "building_type": "Standard",
        "location": "Metro city",
        "labour_cost_adjustment_pct": 2,
        "material_price_variation_pct": 1,
    }

    create_response = api_client.post(
        f"{api_base_url}/api/projects",
        json={"project_name": unique_name, "input_data": input_data},
    )
    assert create_response.status_code == 200

    created = create_response.json()
    project_id = created["id"]

    get_response = api_client.get(f"{api_base_url}/api/projects/{project_id}")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == project_id
    assert fetched["project_name"] == unique_name
    assert fetched["input_data"]["location"] == "Metro city"


def test_chat_session_creation_message_and_history(api_client, api_base_url):
    session_response = api_client.post(f"{api_base_url}/api/chat/session")
    assert session_response.status_code == 200
    session_data = session_response.json()
    session_id = session_data["session_id"]
    assert isinstance(session_id, str)
    assert len(session_id) >= 8

    message_payload = {
        "session_id": session_id,
        "message": "How should I reduce concrete wastage on site?",
        "project_context": "Building Type: Standard | Floors: 2 | Built-up Area: 1200 sq.ft",
    }
    message_response = api_client.post(f"{api_base_url}/api/chat/message", json=message_payload)
    assert message_response.status_code == 200
    message_data = message_response.json()
    assert message_data["session_id"] == session_id
    assert isinstance(message_data["reply"], str)
    assert len(message_data["reply"].strip()) > 0

    history_response = api_client.get(f"{api_base_url}/api/chat/history/{session_id}?limit=10")
    assert history_response.status_code == 200
    history = history_response.json()
    assert isinstance(history, list)
    assert len(history) >= 2
    assert history[0]["role"] == "user"
    assert history[-1]["role"] == "assistant"
