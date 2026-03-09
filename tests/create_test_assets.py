import base64
from pathlib import Path

assets_dir = Path('/app/tests/assets')
assets_dir.mkdir(parents=True, exist_ok=True)

png_b64 = (
    'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAGElEQVR4nAXBAQEAAAjDMEf/'
    'NDOwpxc7EgN4fQYq8QAAAABJRU5ErkJggg=='
)

pdf_b64 = (
    'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIg'
    'MCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSA+PgplbmRvYmoKMyAw'
    'IG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbMCAwIDMwMCAxNDRdIC9D'
    'b250ZW50cyA0IDAgUiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQpCVAov'
    'RjEgMTIgVGYKNzIgNzIgVGQKKERyYXdpbmcgVGVzdCBQREYpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoK'
    'eHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjIg'
    'MDAwMDAgbiAKMDAwMDAwMDExOSAwMDAwMCBuIAowMDAwMDAwMjEwIDAwMDAwIG4gCnRyYWlsZXIKPDwg'
    'L1NpemUgNSAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMzExCiUlRU9G'
)

(assets_dir / 'drawing_test.png').write_bytes(base64.b64decode(png_b64))
(assets_dir / 'drawing_test.pdf').write_bytes(base64.b64decode(pdf_b64))
(assets_dir / 'unsupported.txt').write_text('not-a-supported-drawing-format', encoding='utf-8')

print('created test assets')
