import os
import uuid

import pytest
import requests

# Module: QS project and revision workflow coverage
# Feature: Measurements, BOQ, rates, and export logs persistence

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


@pytest.fixture
def qs_project_and_version(api_client, api_base_url):
    suffix = uuid.uuid4().hex[:8]
    project_payload = {
        "project_name": f"TEST_QS_{suffix}",
        "client_name": "TEST_Client",
        "location": "Nashik",
        "built_up_area": 1250,
        "floors": 2,
        "construction_type": "RCC Frame",
        "rate_profile": "Standard",
    }
    project_response = api_client.post(f"{api_base_url}/api/qs/projects", json=project_payload)
    assert project_response.status_code == 200
    project = project_response.json()

    version_response = api_client.post(
        f"{api_base_url}/api/qs/projects/{project['id']}/versions",
        json={"version_name": "Rev-1", "revision_notes": "Initial", "drawing_files": ["A1.pdf"]},
    )
    assert version_response.status_code == 200
    version = version_response.json()
    return project, version


def test_qs_project_create_and_list(api_client, api_base_url):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "project_name": f"TEST_QS_PROJECT_{suffix}",
        "client_name": "TEST_Client_A",
        "location": "Pune",
        "built_up_area": 980,
        "floors": 1,
        "construction_type": "Load Bearing",
        "rate_profile": "Basic",
    }
    create_response = api_client.post(f"{api_base_url}/api/qs/projects", json=payload)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["project_name"] == payload["project_name"]
    assert created["client_name"] == payload["client_name"]
    assert isinstance(created["id"], str)

    list_response = api_client.get(f"{api_base_url}/api/qs/projects?limit=100")
    assert list_response.status_code == 200
    listed = list_response.json()
    match = [item for item in listed if item["id"] == created["id"]]
    assert len(match) == 1
    assert match[0]["location"] == payload["location"]


def test_qs_revision_create_and_list(api_client, api_base_url, qs_project_and_version):
    project, first_version = qs_project_and_version
    next_response = api_client.post(
        f"{api_base_url}/api/qs/projects/{project['id']}/versions",
        json={"version_name": "Rev-2", "revision_notes": "Scope update", "drawing_files": ["B2.pdf"]},
    )
    assert next_response.status_code == 200
    second_version = next_response.json()
    assert second_version["project_id"] == project["id"]

    list_response = api_client.get(f"{api_base_url}/api/qs/projects/{project['id']}/versions")
    assert list_response.status_code == 200
    versions = list_response.json()
    ids = [row["id"] for row in versions]
    assert first_version["id"] in ids
    assert second_version["id"] in ids


def test_qs_revision_invalid_project_returns_404(api_client, api_base_url):
    response = api_client.post(
        f"{api_base_url}/api/qs/projects/{uuid.uuid4()}/versions",
        json={"version_name": "Rev-X", "revision_notes": "Invalid", "drawing_files": []},
    )
    assert response.status_code == 404
    data = response.json()
    assert data["detail"] == "Project not found"


def test_qs_measurements_upsert_and_list_persistence(api_client, api_base_url, qs_project_and_version):
    _, version = qs_project_and_version
    measurement_id = str(uuid.uuid4())
    payload = {
        "items": [
            {
                "id": measurement_id,
                "category": "Brickwork",
                "description": "Wall A",
                "length": 12,
                "width": 0.23,
                "height": 3,
                "depth": 0,
                "diameter": 0,
                "quantity": 8.28,
                "quantity_override": False,
                "unit": "m3",
                "formula": "length*width*height",
                "additions": 0.4,
                "deductions": 0.1,
                "wastage_percent": 5,
                "rate": 6200,
                "amount": 55200,
                "note": "TEST row",
            }
        ]
    }

    upsert_response = api_client.post(
        f"{api_base_url}/api/qs/versions/{version['id']}/measurements",
        json=payload,
    )
    assert upsert_response.status_code == 200
    saved = upsert_response.json()
    assert len(saved) == 1
    assert saved[0]["id"] == measurement_id
    assert saved[0]["description"] == "Wall A"

    get_response = api_client.get(f"{api_base_url}/api/qs/versions/{version['id']}/measurements")
    assert get_response.status_code == 200
    rows = get_response.json()
    matched = [row for row in rows if row["id"] == measurement_id]
    assert len(matched) == 1
    assert matched[0]["category"] == "Brickwork"
    assert matched[0]["rate"] == 6200


def test_qs_measurements_invalid_version_returns_404(api_client, api_base_url):
    response = api_client.post(
        f"{api_base_url}/api/qs/versions/{uuid.uuid4()}/measurements",
        json={"items": []},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Project version not found"


def test_qs_boq_upsert_and_list_persistence(api_client, api_base_url, qs_project_and_version):
    _, version = qs_project_and_version
    boq_id = str(uuid.uuid4())
    payload = {
        "items": [
            {
                "id": boq_id,
                "section": "Masonry",
                "description": "Brick wall",
                "qty": 10.5,
                "unit": "m3",
                "rate": 6200,
                "total": 65100,
                "sr_no": 1,
            }
        ]
    }
    upsert_response = api_client.post(f"{api_base_url}/api/qs/versions/{version['id']}/boq", json=payload)
    assert upsert_response.status_code == 200
    saved = upsert_response.json()
    assert len(saved) == 1
    assert saved[0]["id"] == boq_id
    assert saved[0]["total"] == 65100

    list_response = api_client.get(f"{api_base_url}/api/qs/versions/{version['id']}/boq")
    assert list_response.status_code == 200
    items = list_response.json()
    matched = [item for item in items if item["id"] == boq_id]
    assert len(matched) == 1
    assert matched[0]["description"] == "Brick wall"


def test_qs_rates_material_and_labour_upsert_and_list(api_client, api_base_url):
    suffix = uuid.uuid4().hex[:6]
    city = f"TEST_CITY_{suffix}"
    material_id = str(uuid.uuid4())
    labour_id = str(uuid.uuid4())

    material_response = api_client.post(
        f"{api_base_url}/api/qs/rates/material",
        json=[{"id": material_id, "material_name": "Cement", "city": city, "unit": "bag", "rate": 450}],
    )
    assert material_response.status_code == 200
    material_rows = material_response.json()
    assert material_rows[0]["id"] == material_id
    assert material_rows[0]["city"] == city

    labour_response = api_client.post(
        f"{api_base_url}/api/qs/rates/labour",
        json=[{"id": labour_id, "labour_type": "Mason", "city": city, "unit": "day", "rate": 1200}],
    )
    assert labour_response.status_code == 200
    labour_rows = labour_response.json()
    assert labour_rows[0]["id"] == labour_id
    assert labour_rows[0]["rate"] == 1200

    material_list = api_client.get(f"{api_base_url}/api/qs/rates/material?city={city}")
    assert material_list.status_code == 200
    assert any(row["id"] == material_id for row in material_list.json())

    labour_list = api_client.get(f"{api_base_url}/api/qs/rates/labour?city={city}")
    assert labour_list.status_code == 200
    assert any(row["id"] == labour_id for row in labour_list.json())


def test_qs_export_log_create_and_list(api_client, api_base_url, qs_project_and_version):
    _, version = qs_project_and_version
    create_response = api_client.post(
        f"{api_base_url}/api/qs/export-logs",
        json={"project_version_id": version["id"], "export_type": "excel"},
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["project_version_id"] == version["id"]
    assert created["export_type"] == "excel"

    list_response = api_client.get(f"{api_base_url}/api/qs/export-logs?project_version_id={version['id']}")
    assert list_response.status_code == 200
    logs = list_response.json()
    matched = [log for log in logs if log["id"] == created["id"]]
    assert len(matched) == 1
    assert matched[0]["export_type"] == "excel"