import base64
import json
import os
import tempfile

import pytest
import requests

# Module: Drawing analyzer enhancements + regression endpoints
# Feature: calibration + confidence + history + compare + core page APIs availability

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAGElEQVR4nAXBAQEAAAjDMEf/"
    "NDOwpxc7EgN4fQYq8QAAAABJRU5ErkJggg=="
)

JPG_BASE64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8PFREWFhUR"
    "FRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGhAQGi0fHyUtLS0tLS0tLS0t"
    "LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAX"
    "AAEBAQEAAAAAAAAAAAAAAAABAgME/8QAFhEBAQEAAAAAAAAAAAAAAAAAABES/8QAFQEBAQAAAAAA"
    "AAAAAAAAAAAAAQP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAAH/2Q=="
)

PDF_BASE64 = (
    "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIg"
    "MCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSA+PgplbmRvYmoKMyAw"
    "IG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbMCAwIDMwMCAxNDRdIC9D"
    "b250ZW50cyA0IDAgUiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQpCVAov"
    "RjEgMTIgVGYKNzIgNzIgVGQKKERyYXdpbmcgVGVzdCBQREYpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoK"
    "eHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjIg"
    "MDAwMDAgbiAKMDAwMDAwMDExOSAwMDAwMCBuIAowMDAwMDAwMjEwIDAwMDAwIG4gCnRyYWlsZXIKPDwg"
    "L1NpemUgNSAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMzExCiUlRU9G"
)


@pytest.fixture(scope="session")
def api_base_url():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    return requests.Session()


def _write_temp_file(content_b64: str, suffix: str) -> str:
    raw = base64.b64decode(content_b64)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_file.write(raw)
    temp_file.flush()
    temp_file.close()
    return temp_file.name


def _analyze_file(api_client, api_base_url, temp_path: str, filename: str, mime: str, calibration="", floors="1", project="TEST_Drawing"):
    with open(temp_path, "rb") as file_handle:
        files = {"drawing_file": (filename, file_handle, mime)}
        data = {
            "project_name": project,
            "location": "Nashik",
            "building_type": "Standard",
            "floors": floors,
            "refresh_frequency": "weekly",
            "quantity_mode": "hybrid",
            "calibration_reference_length_m": calibration,
            "manual_boq_json": json.dumps({"manual_time_hours": 4}),
        }
        return api_client.post(f"{api_base_url}/api/drawing-analyzer/analyze", files=files, data=data, timeout=120)


def test_analyze_png_with_calibration_and_confidence(api_client, api_base_url):
    png_path = _write_temp_file(PNG_BASE64, ".png")
    try:
        response = _analyze_file(
            api_client,
            api_base_url,
            png_path,
            filename="test-plan.png",
            mime="image/png",
            calibration="7.5",
            project="TEST_Calibration_PNG",
        )
        assert response.status_code == 200
        payload = response.json()

        calibration = payload["calibration"]
        assert calibration["reference_length_m"] == 7.5
        assert isinstance(calibration["applied"], bool)
        assert isinstance(calibration["scale_factor"], (int, float))
        assert "note" in calibration and calibration["note"]

        assert isinstance(payload["boq_items"], list) and len(payload["boq_items"]) > 0
        for item in payload["boq_items"]:
            assert "confidence_score" in item
            assert 0 <= item["confidence_score"] <= 1
            assert item["confidence_level"] in ["high", "medium", "low"]
    finally:
        os.unlink(png_path)


def test_analyze_jpg_flow_works(api_client, api_base_url):
    jpg_path = _write_temp_file(JPG_BASE64, ".jpg")
    try:
        response = _analyze_file(
            api_client,
            api_base_url,
            jpg_path,
            filename="test-plan.jpg",
            mime="image/jpeg",
            project="TEST_JPG_FLOW",
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["file_type"] == "jpg"
        assert payload["analysis_id"]
    finally:
        os.unlink(jpg_path)


def test_analyze_pdf_flow_works(api_client, api_base_url):
    pdf_path = _write_temp_file(PDF_BASE64, ".pdf")
    try:
        response = _analyze_file(
            api_client,
            api_base_url,
            pdf_path,
            filename="test-plan.pdf",
            mime="application/pdf",
            floors="2",
            project="TEST_PDF_FLOW",
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["file_type"] == "pdf"
        assert len(payload["optimized_schedule"]) >= 1
    finally:
        os.unlink(pdf_path)


def test_history_endpoint_lists_recent_analyses(api_client, api_base_url):
    response = api_client.get(f"{api_base_url}/api/drawing-analyzer/history?limit=5", timeout=60)
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    if payload:
        first = payload[0]
        assert "analysis_id" in first and isinstance(first["analysis_id"], str)
        assert "total_estimate" in first and isinstance(first["total_estimate"], (int, float))


def test_compare_endpoint_returns_deltas(api_client, api_base_url):
    history = api_client.get(f"{api_base_url}/api/drawing-analyzer/history?limit=10", timeout=60)
    assert history.status_code == 200
    items = history.json()
    if len(items) < 2:
        pytest.skip("Not enough drawing analyses to compare")

    base_id = items[1]["analysis_id"]
    target_id = items[0]["analysis_id"]
    response = api_client.get(
        f"{api_base_url}/api/drawing-analyzer/compare?base_analysis_id={base_id}&target_analysis_id={target_id}",
        timeout=60,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["base_analysis_id"] == base_id
    assert payload["target_analysis_id"] == target_id
    assert isinstance(payload["cost_delta"], (int, float))
    assert isinstance(payload["duration_delta_days"], int)
    assert isinstance(payload["boq_deltas"], list)


@pytest.mark.parametrize(
    "endpoint",
    [
        "/api/",
        "/api/market-rates?refresh_frequency=weekly",
        "/api/projects?limit=1",
        "/api/suppliers/rates?limit=1",
    ],
)
def test_regression_core_api_pages_load(api_client, api_base_url, endpoint):
    response = api_client.get(f"{api_base_url}{endpoint}", timeout=60)
    assert response.status_code == 200
