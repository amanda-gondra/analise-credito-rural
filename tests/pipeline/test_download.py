"""Tests for pipeline/download.py that need no network: URL, hash and gzip header."""

import gzip
import hashlib
from datetime import datetime, timezone

import pytest

from pipeline.download import build_url, download_year, gzip_generated_at, sha256_of


def test_build_url_follows_the_bcb_file_pattern():
    assert build_url(2024) == (
        "https://www.bcb.gov.br/content/estabilidadefinanceira/matriz-dados-credito-rural/regiao/MATRIZ_CR_REGIAO_2024.gz"
    )


def test_sha256_matches_hashlib(tmp_path):
    path = tmp_path / "file.bin"
    path.write_bytes(b"rural credit" * 1000)
    assert sha256_of(path) == hashlib.sha256(b"rural credit" * 1000).hexdigest()


def test_reads_generation_time_from_the_gzip_header(tmp_path):
    generated = datetime(2026, 10, 23, 12, 32, 24, tzinfo=timezone.utc)
    path = tmp_path / "file.gz"
    with gzip.GzipFile(path, "wb", mtime=generated.timestamp()) as file:
        file.write(b"x")
    assert gzip_generated_at(path) == generated


def test_rejects_a_file_that_is_not_gzip(tmp_path):
    path = tmp_path / "error.gz"
    path.write_text("<html>Service Unavailable</html>")
    with pytest.raises(ValueError, match="not a gzip"):
        gzip_generated_at(path)


def test_rejects_years_before_sicor(tmp_path):
    with pytest.raises(ValueError, match="no data before 2013"):
        download_year(2012, tmp_path)


def test_existing_file_is_not_downloaded_again(tmp_path):
    path = tmp_path / "MATRIZ_CR_REGIAO_2024.gz"
    with gzip.GzipFile(path, "wb", mtime=0) as file:
        file.write(b"x")
    source = download_year(2024, tmp_path)  # would fail without network if it tried to download
    assert source.path == path
    assert source.file_generated_at is None  # mtime 0 means "not set"
