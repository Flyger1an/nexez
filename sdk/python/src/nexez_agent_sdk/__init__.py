from __future__ import annotations

import json
from typing import Any, Callable, Dict, Mapping, Optional, Tuple
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

NEXEZ_DEFAULT_BASE_URL = "https://nexez.app"
__version__ = "0.1.0"

JsonObject = Dict[str, Any]
TransportResult = Tuple[int, Mapping[str, str], bytes]
Transport = Callable[[str, str, Mapping[str, str], Optional[bytes], float], TransportResult]


class NexezApiError(Exception):
    """Raised when the Nexez API returns a non-2xx response."""

    def __init__(self, message: str, status: int, url: str, body: Any) -> None:
        super().__init__(message)
        self.status = status
        self.url = url
        self.body = body


class NexezClient:
    """Small dependency-free client for the public Nexez agent runtime."""

    def __init__(
        self,
        base_url: str = NEXEZ_DEFAULT_BASE_URL,
        *,
        buyer_agent: Optional[str] = None,
        timeout: float = 15,
        transport: Optional[Transport] = None,
    ) -> None:
        self.base_url = _normalize_base_url(base_url)
        self.buyer_agent = buyer_agent
        self.timeout = timeout
        self._transport = transport or _urllib_transport

    def search(
        self,
        query: str,
        *,
        limit: Optional[int] = None,
        location: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
    ) -> JsonObject:
        params: Dict[str, Any] = {"q": query}
        if limit is not None:
            params["limit"] = limit
        if location:
            params["location"] = location
        if lat is not None:
            params["lat"] = lat
        if lng is not None:
            params["lng"] = lng
        return self._request_json(f"/api/agent-search?{urlencode(params)}")

    def get_agent_page(self, slug: str) -> JsonObject:
        _assert_path_segment(slug, "slug")
        return self._request_json(f"/{slug}/agent.json")

    def validate_checkout(self, payload: Optional[Mapping[str, Any]] = None, **kwargs: Any) -> JsonObject:
        body = _merge_payload(payload, kwargs)
        self._inject_buyer_agent(body)
        body["dryRun"] = True
        return self._request_json("/api/checkout", method="POST", body=body)

    def validate_negotiation(self, payload: Optional[Mapping[str, Any]] = None, **kwargs: Any) -> JsonObject:
        body = _merge_payload(payload, kwargs)
        self._inject_buyer_agent(body)
        body["dryRun"] = True
        return self._request_json("/api/negotiations", method="POST", body=body)

    def submit_negotiation(self, payload: Optional[Mapping[str, Any]] = None, **kwargs: Any) -> JsonObject:
        body = _merge_payload(payload, kwargs)
        self._inject_buyer_agent(body)
        body.pop("dryRun", None)
        return self._request_json("/api/negotiations", method="POST", body=body)

    def _inject_buyer_agent(self, body: JsonObject) -> None:
        if self.buyer_agent and not body.get("buyerAgent"):
            body["buyerAgent"] = self.buyer_agent

    def _request_json(self, path: str, *, method: str = "GET", body: Optional[JsonObject] = None) -> JsonObject:
        url = path if path.startswith("http://") or path.startswith("https://") else f"{self.base_url}{path}"
        raw_body = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "accept": "application/json",
            "user-agent": f"nexez-agent-sdk-python/{__version__}",
        }
        if raw_body is not None:
            headers["content-type"] = "application/json"

        status, _headers, response_body = self._transport(url, method, headers, raw_body, self.timeout)
        parsed = _parse_body(response_body)
        if status < 200 or status >= 300:
            message = _error_message(parsed) or f"Nexez request failed with status {status}"
            raise NexezApiError(message, status, url, parsed)
        return parsed if isinstance(parsed, dict) else {"data": parsed}


def create_client(**options: Any) -> NexezClient:
    return NexezClient(**options)


def create_nexez_client(**options: Any) -> NexezClient:
    return NexezClient(**options)


def search_nexez(query: str, **options: Any) -> JsonObject:
    client_options, call_options = _split_options(options)
    return NexezClient(**client_options).search(query, **call_options)


def get_agent_page(slug: str, **options: Any) -> JsonObject:
    client_options, _call_options = _split_options(options)
    return NexezClient(**client_options).get_agent_page(slug)


def validate_checkout(payload: Optional[Mapping[str, Any]] = None, **options: Any) -> JsonObject:
    client_options, call_options = _split_options(options)
    return NexezClient(**client_options).validate_checkout(payload, **call_options)


def validate_negotiation(payload: Optional[Mapping[str, Any]] = None, **options: Any) -> JsonObject:
    client_options, call_options = _split_options(options)
    return NexezClient(**client_options).validate_negotiation(payload, **call_options)


def submit_negotiation(payload: Optional[Mapping[str, Any]] = None, **options: Any) -> JsonObject:
    client_options, call_options = _split_options(options)
    return NexezClient(**client_options).submit_negotiation(payload, **call_options)


def _urllib_transport(url: str, method: str, headers: Mapping[str, str], body: Optional[bytes], timeout: float) -> TransportResult:
    request = Request(url, data=body, headers=dict(headers), method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except HTTPError as error:
        return error.code, dict(error.headers), error.read()


_ALIASES = {
    "buyer_agent": "buyerAgent",
    "buyer_email": "buyerEmail",
    "buyer_name": "buyerName",
    "buyer_reference": "buyerReference",
    "dry_run": "dryRun",
    "requested_terms": "requestedTerms",
    "negotiation_id": "negotiationId",
    "status_token": "statusToken",
}


def _merge_payload(payload: Optional[Mapping[str, Any]], kwargs: Mapping[str, Any]) -> JsonObject:
    merged: JsonObject = {}
    for key, value in dict(payload or {}).items():
        merged[_ALIASES.get(key, key)] = value
    for key, value in kwargs.items():
        if value is not None:
            merged[_ALIASES.get(key, key)] = value
    return merged


def _split_options(options: Mapping[str, Any]) -> Tuple[JsonObject, JsonObject]:
    client_keys = {"base_url", "buyer_agent", "timeout", "transport"}
    client_options = {key: value for key, value in options.items() if key in client_keys}
    call_options = {key: value for key, value in options.items() if key not in client_keys}
    return client_options, call_options


def _parse_body(body: bytes) -> Any:
    if not body:
        return None
    text = body.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _error_message(body: Any) -> str:
    if isinstance(body, dict) and isinstance(body.get("error"), str):
        return body["error"]
    return ""


def _normalize_base_url(value: str) -> str:
    parts = urlsplit(value)
    if not parts.scheme or not parts.netloc:
        raise ValueError(f"Invalid Nexez base URL: {value}")
    return f"{parts.scheme}://{parts.netloc}"


def _assert_path_segment(value: str, label: str) -> None:
    if not value or "/" in value or "?" in value or "#" in value:
        raise ValueError(f"Invalid Nexez {label}: {value}")


__all__ = [
    "NEXEZ_DEFAULT_BASE_URL",
    "NexezApiError",
    "NexezClient",
    "create_client",
    "create_nexez_client",
    "get_agent_page",
    "search_nexez",
    "submit_negotiation",
    "validate_checkout",
    "validate_negotiation",
]
