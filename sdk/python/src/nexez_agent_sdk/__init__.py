from __future__ import annotations

import json
import math
import re
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple, TypedDict, cast
from urllib.error import HTTPError
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

NEXEZ_DEFAULT_BASE_URL = "https://nexez.app"
NEXEZ_MAX_DECISION_WAIT_SECONDS = 300.0
__version__ = "0.2.0"

JsonObject = Dict[str, Any]
TransportResult = Tuple[int, Mapping[str, str], bytes]
Transport = Callable[[str, str, Mapping[str, str], Optional[bytes], float], TransportResult]


class _OfferReference(TypedDict):
    slug: str
    offer: str


class CheckoutInput(_OfferReference, total=False):
    query: str
    buyerEmail: str
    buyerName: str
    buyerReference: str
    buyerAgent: str


class NegotiationInput(_OfferReference, total=False):
    buyerAgent: str
    query: str
    requestedTerms: Mapping[str, Any]
    budget: str
    timeline: str
    contact: str
    negotiationId: str
    statusToken: str


class NexezSearchResponse(TypedDict, total=False):
    schema_version: str
    generated_at: str
    query: str
    result_count: int
    search_url: str
    location_filter: JsonObject
    results: List[JsonObject]
    usage: JsonObject


class AgentPageManifest(TypedDict, total=False):
    schema_version: str
    generated_at: str
    last_updated: Optional[str]
    page: JsonObject
    offers: List[JsonObject]
    faqs: List[JsonObject]
    recommended_actions: List[str]
    plain_text: str
    memory_context: Any
    certification: Any


class CheckoutResponse(TypedDict, total=False):
    ok: bool
    provider: str
    url: Optional[str]
    checkoutUrl: str
    checkoutSessionId: str
    actionUrl: Optional[str]
    currency: str
    stripeConfigured: bool
    connectReady: bool
    events: Dict[str, bool]
    error: str
    code: str


class NegotiationDryRunResponse(TypedDict, total=False):
    ok: bool
    dryRun: bool
    rulesEvaluation: Any
    publicPageUrl: str
    error: str


class NegotiationSubmitResponse(TypedDict, total=False):
    ok: bool
    status: str
    decisionPending: bool
    negotiationId: str
    persistentLink: str
    negotiationUrl: str
    escrowMode: str
    stripeConfigured: bool
    publicPageUrl: str
    next: str
    message: str
    statusToken: str
    statusUrl: str
    error: str


class NegotiationStatusResponse(TypedDict, total=False):
    id: str
    status: str
    statusLabel: str
    offer: str
    amountCents: Optional[int]
    settlementState: Optional[str]
    payable: bool
    decisionPending: bool
    decisionSeq: int
    decision: Optional[JsonObject]
    updatedAt: Optional[str]
    next: str


class NexezError(Exception):
    """Base class for errors raised by the Nexez SDK."""


class NexezApiError(NexezError):
    """Raised when the Nexez API returns a non-2xx response."""

    def __init__(self, message: str, status: int, url: str, body: Any) -> None:
        super().__init__(message)
        self.status = status
        self.url = url
        self.body = body


class NexezProtocolError(NexezError):
    """Raised when a successful Nexez response violates the JSON contract."""

    def __init__(self, message: str, status: int, url: str, body: Any) -> None:
        super().__init__(message)
        self.status = status
        self.url = url
        self.body = body


class NexezTransportError(NexezError):
    """Raised when the HTTP transport fails or returns an invalid result."""

    def __init__(self, message: str, url: str, cause: Optional[BaseException] = None) -> None:
        super().__init__(message)
        self.url = url
        self.cause = cause


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
        if buyer_agent is not None:
            _require_text(buyer_agent, "buyer_agent", max_length=120)
        self.buyer_agent = buyer_agent
        self.timeout = _positive_number(timeout, "timeout")
        if transport is not None and not callable(transport):
            raise TypeError("transport must be callable.")
        self._transport = transport or _urllib_transport

    def search(
        self,
        query: str,
        *,
        limit: Optional[int] = None,
        location: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
    ) -> NexezSearchResponse:
        _require_text(query, "query", max_length=2_000)
        if limit is not None:
            if isinstance(limit, bool) or not isinstance(limit, int):
                raise TypeError("limit must be an integer between 1 and 50.")
            if limit < 1 or limit > 50:
                raise ValueError("limit must be between 1 and 50.")
        if location is not None:
            _require_text(location, "location", max_length=300)
        if lat is not None:
            lat = _bounded_number(lat, "lat", -90, 90)
        if lng is not None:
            lng = _bounded_number(lng, "lng", -180, 180)

        params: Dict[str, Any] = {"q": query}
        if limit is not None:
            params["limit"] = limit
        if location is not None:
            params["location"] = location
        if lat is not None:
            params["lat"] = lat
        if lng is not None:
            params["lng"] = lng
        return cast(NexezSearchResponse, self._request_json(f"/api/agent-search?{urlencode(params)}"))

    def get_agent_page(self, slug: str) -> AgentPageManifest:
        _validate_slug(slug)
        return cast(AgentPageManifest, self._request_json(f"/{quote(slug, safe='')}/agent.json"))

    def validate_checkout(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        **kwargs: Any,
    ) -> CheckoutResponse:
        body = _merge_payload(payload, kwargs)
        _validate_action_payload(body, "checkout")
        body.pop("userApproved", None)
        self._inject_buyer_agent(body)
        body["dryRun"] = True
        return cast(CheckoutResponse, self._request_json("/api/checkout", method="POST", body=body))

    def start_checkout(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        *,
        user_approved: bool = False,
        **kwargs: Any,
    ) -> CheckoutResponse:
        _require_approval(user_approved, "start_checkout")
        body = _merge_payload(payload, kwargs)
        _validate_action_payload(body, "checkout")
        body.pop("userApproved", None)
        self._inject_buyer_agent(body)
        body["dryRun"] = False
        return cast(CheckoutResponse, self._request_json("/api/checkout", method="POST", body=body))

    def validate_negotiation(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        **kwargs: Any,
    ) -> NegotiationDryRunResponse:
        body = _merge_payload(payload, kwargs)
        _validate_action_payload(body, "negotiation")
        body.pop("userApproved", None)
        self._inject_buyer_agent(body)
        body["dryRun"] = True
        return cast(
            NegotiationDryRunResponse,
            self._request_json("/api/negotiations", method="POST", body=body),
        )

    def submit_negotiation(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        *,
        user_approved: bool = False,
        **kwargs: Any,
    ) -> NegotiationSubmitResponse:
        _require_approval(user_approved, "submit_negotiation")
        body = _merge_payload(payload, kwargs)
        _validate_action_payload(body, "negotiation")
        body.pop("userApproved", None)
        self._inject_buyer_agent(body)
        body["dryRun"] = False
        return cast(
            NegotiationSubmitResponse,
            self._request_json("/api/negotiations", method="POST", body=body),
        )

    def get_negotiation_status(self, negotiation_id: str, status_token: str) -> NegotiationStatusResponse:
        path = _negotiation_status_path(negotiation_id, status_token)
        return cast(NegotiationStatusResponse, self._request_json(path))

    def wait_for_negotiation_decision(
        self,
        negotiation_id: str,
        status_token: str,
        *,
        timeout: float = 30.0,
        poll_interval: float = 2.0,
    ) -> NegotiationStatusResponse:
        path = _negotiation_status_path(negotiation_id, status_token)
        wait_timeout = _positive_number(timeout, "timeout")
        if wait_timeout > NEXEZ_MAX_DECISION_WAIT_SECONDS:
            raise ValueError(
                f"timeout must not exceed {NEXEZ_MAX_DECISION_WAIT_SECONDS:g} seconds."
            )
        interval = _positive_number(poll_interval, "poll_interval")
        deadline = time.monotonic() + wait_timeout

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Timed out waiting for negotiation {negotiation_id} decision.")

            status = cast(
                NegotiationStatusResponse,
                self._request_json(path, request_timeout=min(self.timeout, remaining)),
            )
            decision_pending = status.get("decisionPending")
            if not isinstance(decision_pending, bool):
                raise NexezProtocolError(
                    "Nexez negotiation status response is missing boolean decisionPending.",
                    200,
                    _redact_url(f"{self.base_url}{path}"),
                    status,
                )
            if not decision_pending:
                return status

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Timed out waiting for negotiation {negotiation_id} decision.")
            time.sleep(min(interval, remaining))

    def _inject_buyer_agent(self, body: JsonObject) -> None:
        if self.buyer_agent and not body.get("buyerAgent"):
            body["buyerAgent"] = self.buyer_agent

    def _request_json(
        self,
        path: str,
        *,
        method: str = "GET",
        body: Optional[JsonObject] = None,
        request_timeout: Optional[float] = None,
    ) -> JsonObject:
        url = _resolve_url(self.base_url, path)
        safe_url = _redact_url(url)
        raw_body = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "accept": "application/json",
            "user-agent": f"nexez-agent-sdk-python/{__version__}",
        }
        if raw_body is not None:
            headers["content-type"] = "application/json"

        effective_timeout = self.timeout
        if request_timeout is not None:
            effective_timeout = _positive_number(request_timeout, "request_timeout")

        try:
            result = self._transport(url, method, headers, raw_body, effective_timeout)
        except Exception as error:
            raise NexezTransportError(
                f"Nexez transport failed ({type(error).__name__}).",
                safe_url,
                error,
            ) from error

        if not isinstance(result, tuple) or len(result) != 3:
            raise NexezTransportError("Nexez transport returned an invalid result.", safe_url)
        status, response_headers, response_body = result
        if isinstance(status, bool) or not isinstance(status, int) or status < 100 or status > 599:
            raise NexezTransportError("Nexez transport returned an invalid HTTP status.", safe_url)
        if not isinstance(response_headers, Mapping):
            raise NexezTransportError("Nexez transport returned invalid response headers.", safe_url)
        if not isinstance(response_body, bytes):
            raise NexezTransportError("Nexez transport returned a non-bytes response body.", safe_url)

        parsed = _parse_body(response_body)
        if status < 200 or status >= 300:
            message = _error_message(parsed) or f"Nexez request failed with status {status}"
            raise NexezApiError(message, status, safe_url, parsed)
        if not isinstance(parsed, dict):
            raise NexezProtocolError(
                "Nexez returned a successful response that was not a JSON object.",
                status,
                safe_url,
                parsed,
            )
        return parsed


def create_client(
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    *,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
) -> NexezClient:
    return NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)


def create_nexez_client(
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    *,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
) -> NexezClient:
    return NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)


def search_nexez(
    query: str,
    *,
    limit: Optional[int] = None,
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
) -> NexezSearchResponse:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.search(query, limit=limit, location=location, lat=lat, lng=lng)


def get_agent_page(
    slug: str,
    *,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
) -> AgentPageManifest:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.get_agent_page(slug)


def validate_checkout(
    payload: Optional[Mapping[str, Any]] = None,
    *,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
    **kwargs: Any,
) -> CheckoutResponse:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.validate_checkout(payload, **kwargs)


def start_checkout(
    payload: Optional[Mapping[str, Any]] = None,
    *,
    user_approved: bool = False,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
    **kwargs: Any,
) -> CheckoutResponse:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.start_checkout(payload, user_approved=user_approved, **kwargs)


def validate_negotiation(
    payload: Optional[Mapping[str, Any]] = None,
    *,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
    **kwargs: Any,
) -> NegotiationDryRunResponse:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.validate_negotiation(payload, **kwargs)


def submit_negotiation(
    payload: Optional[Mapping[str, Any]] = None,
    *,
    user_approved: bool = False,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
    **kwargs: Any,
) -> NegotiationSubmitResponse:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.submit_negotiation(payload, user_approved=user_approved, **kwargs)


def get_negotiation_status(
    negotiation_id: str,
    status_token: str,
    *,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    timeout: float = 15,
    transport: Optional[Transport] = None,
) -> NegotiationStatusResponse:
    client = NexezClient(base_url, buyer_agent=buyer_agent, timeout=timeout, transport=transport)
    return client.get_negotiation_status(negotiation_id, status_token)


def wait_for_negotiation_decision(
    negotiation_id: str,
    status_token: str,
    *,
    timeout: float = 30.0,
    poll_interval: float = 2.0,
    base_url: str = NEXEZ_DEFAULT_BASE_URL,
    buyer_agent: Optional[str] = None,
    request_timeout: float = 15,
    transport: Optional[Transport] = None,
) -> NegotiationStatusResponse:
    client = NexezClient(
        base_url,
        buyer_agent=buyer_agent,
        timeout=request_timeout,
        transport=transport,
    )
    return client.wait_for_negotiation_decision(
        negotiation_id,
        status_token,
        timeout=timeout,
        poll_interval=poll_interval,
    )


def _urllib_transport(
    url: str,
    method: str,
    headers: Mapping[str, str],
    body: Optional[bytes],
    timeout: float,
) -> TransportResult:
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
    "user_approved": "userApproved",
}

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_SENSITIVE_QUERY_KEYS = {"token", "status_token", "statustoken"}


def _merge_payload(payload: Optional[Mapping[str, Any]], kwargs: Mapping[str, Any]) -> JsonObject:
    if payload is not None and not isinstance(payload, Mapping):
        raise TypeError("payload must be a mapping.")
    merged: JsonObject = {}
    for key, value in (payload or {}).items():
        if not isinstance(key, str):
            raise TypeError("payload keys must be strings.")
        merged[_ALIASES.get(key, key)] = value
    for key, value in kwargs.items():
        if value is not None:
            merged[_ALIASES.get(key, key)] = value
    return merged


def _validate_action_payload(body: JsonObject, action: str) -> None:
    slug = body.get("slug")
    if not isinstance(slug, str):
        raise TypeError(f"{action} slug must be a string.")
    _validate_slug(slug)
    _require_text(body.get("offer"), f"{action} offer", max_length=200)

    for key, label, max_length in (
        ("query", "query", 2_000),
        ("buyerEmail", "buyer email", 320),
        ("buyerName", "buyer name", 200),
        ("buyerReference", "buyer reference", 500),
        ("buyerAgent", "buyer agent", 120),
        ("budget", "budget", 200),
        ("timeline", "timeline", 500),
        ("contact", "contact", 500),
        ("negotiationId", "negotiation id", 200),
        ("statusToken", "status token", 512),
    ):
        value = body.get(key)
        if value is not None:
            _require_text(value, label, max_length=max_length)
    requested_terms = body.get("requestedTerms")
    if requested_terms is not None and not isinstance(requested_terms, Mapping):
        raise TypeError("requested_terms must be a mapping.")


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
    _require_text(value, "base_url", max_length=2_048)
    if any(character.isspace() for character in value):
        raise ValueError(f"Invalid Nexez base URL: {value}")
    parts = urlsplit(value)
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        raise ValueError(f"Invalid Nexez base URL: {value}")
    try:
        hostname = parts.hostname
        parts.port
    except ValueError as error:
        raise ValueError(f"Invalid Nexez base URL: {value}") from error
    if not hostname or parts.username is not None or parts.password is not None:
        raise ValueError(f"Invalid Nexez base URL: {value}")
    if parts.query or parts.fragment:
        raise ValueError("Nexez base_url must not contain a query string or fragment.")
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc, path, "", ""))


def _resolve_url(base_url: str, path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        raise ValueError(f"Invalid Nexez request path: {path}")
    return f"{base_url}{path}"


def _redact_url(value: str) -> str:
    try:
        parts = urlsplit(value)
        query = [
            (key, "REDACTED" if key.lower() in _SENSITIVE_QUERY_KEYS else item_value)
            for key, item_value in parse_qsl(parts.query, keep_blank_values=True)
        ]
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    except ValueError:
        return re.sub(r"([?&](?:token|status_token|statusToken)=)[^&]*", r"\1REDACTED", value)


def _negotiation_status_path(negotiation_id: str, status_token: str) -> str:
    _require_text(negotiation_id, "negotiation id", max_length=200)
    _require_text(status_token, "status token", max_length=512)
    return f"/api/negotiations/status?{urlencode({'id': negotiation_id, 'token': status_token})}"


def _validate_slug(value: str) -> None:
    _require_text(value, "slug", max_length=200)
    if not _SLUG_PATTERN.fullmatch(value):
        raise ValueError(f"Invalid Nexez slug: {value}")


def _require_text(value: Any, label: str, *, max_length: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{label} must be a string.")
    if not value.strip():
        raise ValueError(f"{label} must not be empty.")
    if len(value) > max_length:
        raise ValueError(f"{label} must not exceed {max_length} characters.")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError(f"{label} must not contain control characters.")
    return value


def _positive_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{label} must be a finite positive number.")
    numeric = float(value)
    if not math.isfinite(numeric) or numeric <= 0:
        raise ValueError(f"{label} must be a finite positive number.")
    return numeric


def _bounded_number(value: Any, label: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{label} must be a finite number between {minimum:g} and {maximum:g}.")
    numeric = float(value)
    if not math.isfinite(numeric) or numeric < minimum or numeric > maximum:
        raise ValueError(f"{label} must be between {minimum:g} and {maximum:g}.")
    return numeric


def _require_approval(value: bool, action: str) -> None:
    if value is not True:
        raise ValueError(f"{action} requires explicit buyer approval: user_approved must be True.")


__all__ = [
    "AgentPageManifest",
    "CheckoutInput",
    "CheckoutResponse",
    "NEXEZ_DEFAULT_BASE_URL",
    "NEXEZ_MAX_DECISION_WAIT_SECONDS",
    "NegotiationDryRunResponse",
    "NegotiationInput",
    "NegotiationStatusResponse",
    "NegotiationSubmitResponse",
    "NexezApiError",
    "NexezClient",
    "NexezError",
    "NexezProtocolError",
    "NexezSearchResponse",
    "NexezTransportError",
    "Transport",
    "__version__",
    "create_client",
    "create_nexez_client",
    "get_agent_page",
    "get_negotiation_status",
    "search_nexez",
    "start_checkout",
    "submit_negotiation",
    "validate_checkout",
    "validate_negotiation",
    "wait_for_negotiation_decision",
]
