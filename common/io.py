"""Thin, unified IO layer over the local filesystem and S3/MinIO.

All readers/writers accept plain paths relative to the configured
LAKEHOUSE_ROOT scheme:

  * local  -> ./lakehouse/silver/claims/…
  * remote -> s3a://lakehouse/silver/claims/…

Implemented on top of pyarrow's filesystem abstraction so the same functions
work everywhere (pyspark, pandas, FastAPI, Streamlit).
"""
from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from common.config import (
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    IS_S3,
    S3_ENDPOINT,
)


def _split_s3(path: str) -> tuple[str, str]:
    """s3a://bucket/key -> (bucket, key)"""
    clean = path.replace("s3a://", "").replace("s3://", "")
    bucket, _, key = clean.partition("/")
    return bucket, key


def get_fs() -> pa.fs.FileSystem:
    """Return a pyarrow filesystem for the configured lakehouse root."""
    if IS_S3:
        return pa.fs.S3FileSystem(
            access_key=AWS_ACCESS_KEY_ID,
            secret_key=AWS_SECRET_ACCESS_KEY,
            endpoint_override=S3_ENDPOINT.replace("http://", "").replace("https://", ""),
            scheme="http" if S3_ENDPOINT.startswith("http://") else "https",
        )
    return pa.fs.LocalFileSystem()


def _fs_path(path: str | Path) -> str:
    """Convert a lakehouse path to a filesystem-relative path."""
    p = str(path)
    if IS_S3:
        _, key = _split_s3(p)
        return key
    return str(Path(p))


# ── Parquet / Delta directories ──────────────────────────────────────────────
def read_table(path: str | Path) -> pd.DataFrame:
    """Read a parquet (or delta non-checkpointed) dataset directory into pandas."""
    fp = _fs_path(path)
    fs = get_fs()
    try:
        return pq.read_table(fp, filesystem=fs).to_pandas()
    except Exception:
        # Delta tables are parquet dirs; ignore _delta_log entries gracefully
        files = [f.path for f in fs.get_file_info(pa.fs.FileSelector(fp, recursive=True))
                 if f.path.endswith(".parquet")]
        if not files:
            raise
        return pq.read_table([f for f in files], filesystem=fs).to_pandas()


def write_parquet(df: pd.DataFrame, path: str | Path) -> None:
    fp = _fs_path(path)
    fs = get_fs()
    fs.create_dir(fp)  # no-op if exists (also creates parents)
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(table, f"{fp}/part-0000.parquet", filesystem=fs)


# ── CSV ──────────────────────────────────────────────────────────────────────
def read_csv(path: str | Path, **kwargs: Any) -> pd.DataFrame:
    with get_fs().open_input_stream(_fs_path(path)) as f:
        return pd.read_csv(f, **kwargs)


def write_csv(df: pd.DataFrame, path: str | Path) -> None:
    fs = get_fs()
    fp = _fs_path(path)
    fs.create_dir(str(Path(fp).parent))
    with fs.open_output_stream(fp) as f:
        df.to_csv(f, index=False)


# ── JSON / JSONL ─────────────────────────────────────────────────────────────
def write_json(obj: Any, path: str | Path) -> None:
    fs = get_fs()
    fp = _fs_path(path)
    fs.create_dir(str(Path(fp).parent))
    with fs.open_output_stream(fp) as f:
        f.write(json.dumps(obj, indent=2, default=str).encode())


def read_json(path: str | Path) -> Any:
    with get_fs().open_input_stream(_fs_path(path)) as f:
        return json.loads(f.read().decode())


def write_jsonl(rows: list[dict], path: str | Path) -> None:
    fs = get_fs()
    fp = _fs_path(path)
    fs.create_dir(str(Path(fp).parent))
    with fs.open_output_stream(fp) as f:
        for row in rows:
            f.write((json.dumps(row, default=str) + "\n").encode())


def iter_jsonl_dir(dir_path: str | Path) -> Iterator[dict]:
    """Yield every record from dt=*/part-*.jsonl under a landing dataset."""
    fs = get_fs()
    fp = _fs_path(dir_path)
    selector = pa.fs.FileSelector(fp, recursive=True)
    for info in fs.get_file_info(selector):
        if info.path.endswith(".jsonl"):
            with fs.open_input_stream(info.path) as f:
                data = f.readall().decode()
            for line in data.splitlines():
                line = line.strip()
                if line:
                    yield json.loads(line)


def read_jsonl_dir(dir_path: str | Path) -> pd.DataFrame:
    """Read a whole landing dataset (dt= partitions) into a DataFrame."""
    rows = list(iter_jsonl_dir(dir_path))
    return pd.DataFrame(rows)


def ensure_dir(path: str | Path) -> None:
    fs = get_fs()
    fs.create_dir(_fs_path(path))
