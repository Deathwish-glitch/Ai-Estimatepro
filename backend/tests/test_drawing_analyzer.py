import base64
import json
import os
import tempfile

import pytest
import requests

# Module: Drawing analyzer API coverage
# Feature: upload validation, PNG/PDF analysis path, hybrid quantity outputs, market rate integration

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

# 3x3 PNG with non-uniform pixel data (base64)
PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAGElEQVR4nAXBAQEAAAjDMEf/"
    "NDOwpxc7EgN4fQYq8QAAAABJRU5ErkJggg=="
)

# Minimal single-page PDF bytes (base64)
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


def test_drawing_analyzer_rejects_unsupported_format(api_client, api_base_url):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="w", encoding="utf-8") as text_file:
        text_file.write("not-a-drawing")
        text_path = text_file.name

    try:
        with open(text_path, "rb") as file_handle:
            files = {"drawing_file": ("invalid.txt", file_handle, "text/plain")}
            response = api_client.post(f"{api_base_url}/api/drawing-analyzer/analyze", files=files)

        assert response.status_code == 400
        data = response.json()
        assert "Supported formats" in data["detail"]
    finally:
        os.unlink(text_path)


def test_drawing_analyzer_png_hybrid_returns_boq_cost_warnings_and_comparison(api_client, api_base_url):
    png_path = _write_temp_file(PNG_BASE64, ".png")

    try:
        manual_payload = {
            "Brickwork": 120,
            "Concrete": 85,
            "Steel": 6.5,
            "Plaster": 660,
            "manual_time_hours": 5,
        }
        with open(png_path, "rb") as file_handle:
            files = {"drawing_file": ("test-drawing.png", file_handle, "image/png")}
            data = {
                "location": "Nashik",
                "building_type": "Standard",
                "floors": "1",
                "refresh_frequency": "weekly",
                "quantity_mode": "hybrid",
                "manual_boq_json": json.dumps(manual_payload),
            }
            response = api_client.post(f"{api_base_url}/api/drawing-analyzer/analyze", files=files, data=data, timeout=90)

        assert response.status_code == 200
        payload = response.json()

        assert payload["file_type"] == "png"
        assert payload["quantity_mode"] == "hybrid"
        assert len(payload["boq_items"]) >= 5
        assert payload["cost_estimate"]["total_estimate"] > 0
        assert len(payload["warnings"]) >= 1
        assert len(payload["assumptions"]) >= 1
        assert len(payload["manual_vs_ai_quantities"]) == 4
        assert payload["method_time_comparison"]["manual_time_required"] == "5.0 hours"
        assert payload["method_time_comparison"]["ai_time_required"] == "10 seconds"

        materials = {item["material"] for item in payload["market_rates_used"]}
        assert {"Cement", "Steel", "Sand", "Brick"}.issubset(materials)
    finally:
        os.unlink(png_path)


def test_drawing_analyzer_pdf_path_converts_and_returns_schedule(api_client, api_base_url):
    pdf_path = _write_temp_file(PDF_BASE64, ".pdf")

    try:
        with open(pdf_path, "rb") as file_handle:
            files = {"drawing_file": ("test-drawing.pdf", file_handle, "application/pdf")}
            data = {
                "location": "Nashik",
                "building_type": "Basic",
                "floors": "2",
                "refresh_frequency": "daily",
                "quantity_mode": "hybrid",
            }
            response = api_client.post(f"{api_base_url}/api/drawing-analyzer/analyze", files=files, data=data, timeout=90)

        assert response.status_code == 200
        payload = response.json()

        assert payload["file_type"] == "pdf"
        assert payload["analysis_id"]
        assert len(payload["optimized_schedule"]) >= 4
        assert any(stage["can_run_parallel"] for stage in payload["optimized_schedule"])
        assert payload["cost_estimate"]["material_cost"] > 0
        assert payload["detected_elements"]["walls"] >= 0
    finally:
        os.unlink(pdf_path)
