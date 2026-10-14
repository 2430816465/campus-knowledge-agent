"""Read links from published WebPlus carousel/calendar literal data.

This adapter never evaluates JavaScript or requests a URL. Its raw URL results
must pass the caller's normalization, scope, account and robots checks.
"""
from __future__ import annotations

import html
import json
import re

from bs4 import BeautifulSoup

_DATA_NAME = re.compile(r"(?:w\d+imgJsons|calendar_wh)\Z")
_IDENTIFIER = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
_NUMBER = re.compile(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?")
_MAX_TOKENS = 32768
_MAX_DEPTH = 8
_MAX_STRING = 16384


def _quoted(source: str, start: int):
    """Decode a quoted JS string; reject unsupported or unterminated escapes."""
    quote = source[start]
    result = []
    index = start + 1
    valid = True
    escapes = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}
    while index < len(source):
        char = source[index]
        index += 1
        if char == quote:
            value = "".join(result)
            try:
                value = value.encode("utf-16-le", "surrogatepass").decode("utf-16-le")
            except UnicodeError:
                valid = False
            return (value if valid else None), index
        if char in "\r\n":
            valid = False
        if char != "\\":
            result.append(char)
        elif index >= len(source):
            break
        else:
            escaped = source[index]
            index += 1
            if escaped in "\\/'\"":
                result.append(escaped)
            elif escaped in escapes:
                result.append(escapes[escaped])
            elif escaped in "\r\n":
                if escaped == "\r" and source[index:index + 1] == "\n":
                    index += 1
            elif escaped in ("x", "u"):
                count = 2 if escaped == "x" else 4
                digits = source[index:index + count]
                if len(digits) != count or not re.fullmatch(r"[0-9a-fA-F]+", digits):
                    valid = False
                else:
                    result.append(chr(int(digits, 16)))
                index += count
            else:
                valid = False
        if len(result) > _MAX_STRING:
            valid = False
    return None, len(source)


def _tokens(source: str):
    tokens = []
    index = 0
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        if source.startswith("//", index):
            ends = [end for end in (source.find("\n", index), source.find("\r", index)) if end >= 0]
            index = min(ends) if ends else len(source)
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            index = end + 2 if end >= 0 else len(source)
            continue
        if char in "'\"":
            value, index = _quoted(source, index)
            tokens.append(("string" if value is not None else "invalid", value))
        elif char == "`":
            # Templates and interpolations are deliberately not literal data.
            index += 1
            while index < len(source):
                if source[index] == "\\":
                    index += 2
                elif source[index] == "`":
                    index += 1
                    break
                else:
                    index += 1
            tokens.append(("invalid", None))
        elif match := _IDENTIFIER.match(source, index):
            tokens.append(("identifier", match.group()))
            index = match.end()
        elif match := _NUMBER.match(source, index):
            tokens.append(("number", match.group()))
            index = match.end()
        else:
            tokens.append(("punctuation", char))
            index += 1
        if len(tokens) > _MAX_TOKENS:
            return []
    return tokens


def _literal_array(tokens, start):
    """Turn a small literal-only JS subset into JSON, without eval."""
    output = []
    stack = []
    for index in range(start, len(tokens)):
        kind, value = tokens[index]
        following = tokens[index + 1][1] if index + 1 < len(tokens) else None
        if kind == "string":
            output.append(json.dumps(value, ensure_ascii=True))
        elif kind == "number":
            output.append(value)
        elif kind == "identifier" and following == ":":
            output.append(json.dumps(value))
        elif kind == "identifier" and value in ("true", "false", "null"):
            output.append(value)
        elif kind == "punctuation" and value in "[{":
            stack.append(value)
            if len(stack) > _MAX_DEPTH:
                return None
            output.append(value)
        elif kind == "punctuation" and value in "]}":
            if not stack or stack.pop() != {"]": "[", "}": "{"}[value]:
                return None
            output.append(value)
            if not stack:
                try:
                    result = json.loads("".join(output))
                    return result if isinstance(result, list) else None
                except (ValueError, RecursionError):
                    return None
        elif kind == "punctuation" and value in ",:":
            if value != "," or following not in ("}", "]"):
                output.append(value)
        else:
            # Calls, concatenations, computed properties and variables fail closed.
            return None
    return None


def _url_literal(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 2048:
        return None
    value = html.unescape(value).strip()
    if re.search(r"[\s\x00-\x1f\x7f<>\"'{}\\]", value):
        return None
    if re.match(r"(?:https?://|//|/|\./|\.\./)", value, re.I):
        return value
    # Literal relative article/file paths are allowed; plain dates/labels are not.
    if re.match(r"[A-Za-z0-9_./%-]+\.(?:html?|pdf|docx?|xlsx?|pptx?)(?:[?#].*)?$", value, re.I):
        return value
    return None


def _label(value):
    if not isinstance(value, str):
        return ""
    fragment = BeautifulSoup(html.unescape(value), "html.parser")
    for node in fragment.select("script,style"):
        node.decompose()
    return " ".join(fragment.get_text(" ", strip=True).split())[:300]


def extract_published_links(soup, *, max_script_bytes=262144, max_total_script_bytes=1048576,
                            max_scripts=128, max_links=512):
    """Return ``(raw_url, label, relation)`` from two known WebPlus data arrays.

    ``soup`` is the already parsed page. Oversized scripts and nonliteral arrays
    are skipped. Limits apply before parsing, and duplicate URLs are emitted once.
    External/account URLs remain subject to the caller's existing scope checks.
    """
    if min(max_script_bytes, max_total_script_bytes, max_scripts, max_links) <= 0:
        return []
    found = {}
    total_bytes = 0
    for script in soup.find_all("script", limit=max_scripts):
        if script.get("src"):
            continue
        data = script.string or script.get_text()
        size = len(data.encode("utf-8", "surrogatepass"))
        if size > max_script_bytes:
            continue
        if total_bytes + size > max_total_script_bytes:
            break
        total_bytes += size
        tokens = _tokens(data)
        for index in range(len(tokens) - 3):
            if (tokens[index][0] != "identifier" or tokens[index][1] not in ("var", "let", "const")
                    or tokens[index + 1][0] != "identifier" or not _DATA_NAME.fullmatch(tokens[index + 1][1])
                    or tokens[index + 2] != ("punctuation", "=") or tokens[index + 3] != ("punctuation", "[")):
                continue
            records = _literal_array(tokens, index + 3)
            if records is None:
                continue
            for record in records:
                if not isinstance(record, dict):
                    continue
                # The verified calendar stores rendered anchors in its title.
                # URL fields and arbitrary record values must not become HTML.
                for key, value in record.items():
                    if key != "title":
                        continue
                    if not isinstance(value, str) or not re.search(r"(?:<|&lt;)a\b", value, re.I):
                        continue
                    fragment = BeautifulSoup(html.unescape(value), "html.parser")
                    for anchor in fragment.select("a[href]"):
                        url = _url_literal(anchor.get("href"))
                        if url and url not in found:
                            found[url] = (url, _label(anchor.get("title") or anchor.get_text(" ", strip=True)), "script_literal_anchor")
                            if len(found) >= max_links:
                                return list(found.values())
                url = _url_literal(record.get("url"))
                if url and url not in found:
                    found[url] = (url, _label(record.get("title", "")), "script_literal_url")
                    if len(found) >= max_links:
                        return list(found.values())
    return list(found.values())
