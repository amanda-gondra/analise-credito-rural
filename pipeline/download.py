"""Download the yearly MDCR files (view "regiao") from the Banco Central do Brasil.

Each file is saved unchanged in data/raw/mdcr_regiao/ and identified by its
SHA-256 hash, so every number in the database can be traced back to the exact
version of the source file that produced it (decision D3).

Usage, from the project root:
    python -m pipeline.download 2017 2025          # skip years already downloaded
    python -m pipeline.download 2024 2024 --force  # download again (the source is revised daily)
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import sys
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://www.bcb.gov.br/content/estabilidadefinanceira/matriz-dados-credito-rural/regiao"
FIRST_AVAILABLE_YEAR = 2013  # Sicor starts on 2013-01-01
DEFAULT_DEST_DIR = Path("data/raw/mdcr_regiao")

REQUEST_TIMEOUT_SECONDS = 120
CHUNK_SIZE_BYTES = 1024 * 1024
GZIP_MAGIC = b"\x1f\x8b"
USER_AGENT = "rural-credit-analysis/0.1 (+https://github.com/amanda-gondra/analise-credito-rural)"


@dataclass(frozen=True)
class SourceFile:
    """A downloaded yearly file and the metadata stored in the source_file table."""

    reference_year: int
    path: Path
    source_url: str
    file_sha256: str
    size_bytes: int
    collected_at: datetime
    file_generated_at: datetime | None


def build_url(year: int) -> str:
    return f"{BASE_URL}/{file_name(year)}"


def file_name(year: int) -> str:
    return f"MATRIZ_CR_REGIAO_{year}.gz"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(CHUNK_SIZE_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def gzip_generated_at(path: Path) -> datetime | None:
    """Read the MTIME field of the gzip header: when the BCB generated the file.

    Header layout (RFC 1952): 2 magic bytes, 1 method byte, 1 flags byte,
    then MTIME as a 4-byte little-endian Unix timestamp. Zero means "not set".
    """
    with path.open("rb") as file:
        header = file.read(8)
    if len(header) < 8 or header[:2] != GZIP_MAGIC:
        raise ValueError(f"{path} is not a gzip file")
    (mtime,) = struct.unpack("<I", header[4:8])
    return datetime.fromtimestamp(mtime, tz=timezone.utc) if mtime else None


def download_year(year: int, dest_dir: Path = DEFAULT_DEST_DIR, force: bool = False) -> SourceFile:
    """Download one yearly file and return its metadata.

    The file is written to a temporary ".part" name and only renamed when the
    download is complete and looks like gzip, so an interrupted download never
    leaves a broken file with the final name.
    """
    if year < FIRST_AVAILABLE_YEAR:
        raise ValueError(f"no data before {FIRST_AVAILABLE_YEAR}: {year}")

    dest_dir.mkdir(parents=True, exist_ok=True)
    final_path = dest_dir / file_name(year)
    url = build_url(year)

    if final_path.exists() and not force:
        # The collection time of an existing file is when it was last written.
        collected_at = datetime.fromtimestamp(final_path.stat().st_mtime, tz=timezone.utc)
        return _describe(year, final_path, url, collected_at)

    part_path = final_path.with_name(final_path.name + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    collected_at = datetime.now(timezone.utc)
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response, part_path.open("wb") as out:
            for chunk in iter(lambda: response.read(CHUNK_SIZE_BYTES), b""):
                out.write(chunk)
        gzip_generated_at(part_path)  # raises if the server returned something other than gzip
        part_path.replace(final_path)  # atomic rename on the same disk
    finally:
        part_path.unlink(missing_ok=True)

    return _describe(year, final_path, url, collected_at)


def _describe(year: int, path: Path, url: str, collected_at: datetime) -> SourceFile:
    return SourceFile(
        reference_year=year,
        path=path,
        source_url=url,
        file_sha256=sha256_of(path),
        size_bytes=path.stat().st_size,
        collected_at=collected_at,
        file_generated_at=gzip_generated_at(path),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download the yearly MDCR files from the Banco Central.")
    parser.add_argument("first_year", type=int)
    parser.add_argument("last_year", type=int)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST_DIR, help="destination folder")
    parser.add_argument("--force", action="store_true", help="download again even if the file exists")
    args = parser.parse_args(argv)

    if args.first_year > args.last_year:
        parser.error("first_year must be less than or equal to last_year")

    failures = 0
    for year in range(args.first_year, args.last_year + 1):
        try:
            source = download_year(year, args.dest, args.force)
        except Exception as error:  # report and continue with the other years
            failures += 1
            print(f"{year}  ERROR  {error}", file=sys.stderr)
            continue
        generated = source.file_generated_at.isoformat() if source.file_generated_at else "unknown"
        print(f"{year}  {source.size_bytes / 1e6:6.1f} MB  sha256={source.file_sha256[:12]}  generated={generated}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
