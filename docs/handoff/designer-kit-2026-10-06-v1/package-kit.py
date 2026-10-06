"""Package the designer handoff, updating checksums and testing the ZIP."""
import csv
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
index = root / 'ASSET-INDEX.json'
data = json.loads(index.read_text())
for entry in data['files']:
    content = (root / entry['path']).read_bytes()
    entry.update(sha256=hashlib.sha256(content).hexdigest(), bytes=len(content))
index.write_text(json.dumps(data, indent=2) + '\n')
with (root / 'ASSET-INDEX.csv').open('w', newline='') as output:
    writer = csv.DictWriter(output, fieldnames=list(data['files'][0]), lineterminator='\n')
    writer.writeheader()
    writer.writerows(data['files'])

files = sorted(p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts
               and p.name not in {'.DS_Store', 'FILE-CHECKSUMS.sha256'})
checksums = root / 'FILE-CHECKSUMS.sha256'
checksums.write_text(''.join(
    f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root).as_posix()}\n'
    for p in files))
archive_path = root.parent / 'Time-Tapestry-Designer-Kit_2026-10-06_v1.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(files + [checksums]):
        archive.write(path, Path('Time-Tapestry-Designer-Kit_v1') / path.relative_to(root))
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None, 'Archive integrity check failed'
    print(f'Verified {len(archive.infolist())} files; {archive_path.stat().st_size:,} byte ZIP')
