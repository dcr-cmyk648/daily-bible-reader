"""Pinned, stdin-only source consultation. No PDF or extracted body is saved."""
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import sys

MAX_INPUT = 2 * 1024 * 1024
MAX_DECODED = 4 * 1024 * 1024
MAX_TEXT = 512 * 1024
VERSION = "6.10.0"
PACKAGE_SHA = "47b3f5a16613a2a7898e649f1dcd1a08a9069b2118bc460efb17b9fa8d407476"


def deny_side_effects(event, args):
    if event == "open":
        mode, flags = args[1:3]
        if (isinstance(mode, str) and any(c in mode for c in "wax+")) or (
            isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)
        ):
            raise PermissionError("PDF side effect refused")
    if event.startswith(("socket.", "subprocess.", "ctypes.")) or event in {
        "os.system", "os.fork", "os.forkpty", "os.posix_spawn", "os.spawn", "os.exec",
        "os.mkdir", "os.remove", "os.rename", "os.rmdir", "os.link", "os.symlink",
        "os.truncate", "os.chmod", "os.chown", "os.utime", "os.chdir",
    }:
        raise PermissionError("PDF side effect refused")


def extract():
    sys.addaudithook(deny_side_effects)
    spec = importlib.util.find_spec("pypdf")
    if spec is None or spec.origin is None:
        raise ValueError("PDF_PACKAGE_CHANGED")
    package = pathlib.Path(spec.origin).parent
    tree_hash = hashlib.sha256()
    for file in sorted(package.rglob("*.py"), key=lambda p: p.relative_to(package).as_posix()):
        tree_hash.update(file.relative_to(package).as_posix().encode() + b"\0")
        tree_hash.update(hashlib.sha256(file.read_bytes()).digest())
    if tree_hash.hexdigest() != PACKAGE_SHA:
        raise ValueError("PDF_PACKAGE_CHANGED")
    import pypdf
    import pypdf.filters as filters
    if pypdf.__version__ != VERSION:
        raise ValueError("PDF_PACKAGE_CHANGED")
    for name in ("MAX_DECLARED_STREAM_LENGTH", "MAX_ARRAY_BASED_STREAM_OUTPUT_LENGTH",
                 "JBIG2_MAX_OUTPUT_LENGTH", "LZW_MAX_OUTPUT_LENGTH", "RUN_LENGTH_MAX_OUTPUT_LENGTH",
                 "ZLIB_MAX_OUTPUT_LENGTH", "ZLIB_MAX_RECOVERY_INPUT_LENGTH"):
        setattr(filters, name, MAX_INPUT)
    # Enforce one cumulative decoded-stream cap, including font/CMap streams.
    # Images, JBIG2 external decoders, encryption and unknown filters are refused.
    original_decode = filters.decode_stream_data
    decoded_bytes = 0

    def decode(stream):
        nonlocal decoded_bytes
        names = stream.get("/Filter", [])
        if isinstance(names, str):
            names = [names]
        if any(str(name) not in {"/FlateDecode", "/Fl", "/ASCIIHexDecode", "/AHx",
                                 "/ASCII85Decode", "/A85", "/LZWDecode", "/LZW",
                                 "/RunLengthDecode", "/RL"} for name in names):
            raise ValueError("PDF_FILTER_REFUSED")
        value = original_decode(stream)
        decoded_bytes += len(value)
        if len(value) > MAX_INPUT or decoded_bytes > MAX_DECODED:
            raise ValueError("PDF_DECODED_SIZE_LIMIT")
        return value

    filters.decode_stream_data = decode
    from pypdf.generic import DecodedStreamObject
    original_plain_data = DecodedStreamObject.get_data

    def plain_data(stream):
        nonlocal decoded_bytes
        value = original_plain_data(stream)
        decoded_bytes += len(value)
        if len(value) > MAX_INPUT or decoded_bytes > MAX_DECODED:
            raise ValueError("PDF_DECODED_SIZE_LIMIT")
        return value

    DecodedStreamObject.get_data = plain_data
    data = sys.stdin.buffer.read(MAX_INPUT + 1)
    if not data.startswith(b"%PDF-") or len(data) > MAX_INPUT:
        raise ValueError("PDF_INPUT_INVALID")
    reader = pypdf.PdfReader(io.BytesIO(data), strict=True)
    if reader.is_encrypted:
        raise ValueError("PDF_ENCRYPTED_REFUSED")
    if not 1 <= len(reader.pages) <= 32:
        raise ValueError("PDF_PAGE_LIMIT")
    parts, text_bytes = [], 0
    for page in reader.pages:
        # Bound uncompressed content before parsing text operators as well.
        content = page.get_contents()
        if content is not None:
            value = content.get_data()
            if len(value) > MAX_INPUT:
                raise ValueError("PDF_DECODED_SIZE_LIMIT")
        text = page.extract_text(extraction_mode="plain")
        text_bytes += len(text.encode("utf-8")) + 1
        if text_bytes > MAX_TEXT:
            raise ValueError("PDF_TEXT_LIMIT")
        parts.append(text)
    text = "\n".join(parts)
    return dict(status="ok", text=text, method="pypdf-plain/v1", version=VERSION,
                packageSha256=PACKAGE_SHA, pages=len(reader.pages), decodedBytes=decoded_bytes,
                extractedTextSha256=hashlib.sha256(text.encode()).hexdigest())


if __name__ == "__main__":
    try:
        result = extract()
    except Exception as error:
        # No exception text, source bytes, path or parser diagnostics in the proof.
        code = str(error)
        known = {"PDF_PACKAGE_CHANGED", "PDF_FILTER_REFUSED", "PDF_DECODED_SIZE_LIMIT", "PDF_INPUT_INVALID",
                 "PDF_ENCRYPTED_REFUSED", "PDF_PAGE_LIMIT", "PDF_TEXT_LIMIT"}
        result = dict(status="blocked", code=code if code in known else "PDF_EXTRACTION_FAILED")
    sys.stdout.write(json.dumps(result, ensure_ascii=True))
