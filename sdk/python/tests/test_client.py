import json
import math
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from nexez_agent_sdk import (  # noqa: E402
    NEXEZ_MAX_DECISION_WAIT_SECONDS,
    NexezApiError,
    NexezProtocolError,
    NexezTransportError,
    __version__,
    create_client,
    get_agent_page,
    get_negotiation_status,
    search_nexez,
    start_checkout,
    submit_negotiation,
    validate_checkout,
    validate_negotiation,
    wait_for_negotiation_decision,
)


_UNSET = object()


class FakeTransport:
    def __init__(self, response=None, status=200, *, raw_body=_UNSET, result=_UNSET, error=None):
        self.response = {} if response is None else response
        self.status = status
        self.raw_body = raw_body
        self.result = result
        self.error = error
        self.calls = []

    def __call__(self, url, method, headers, body, timeout):
        parsed_body = json.loads(body.decode("utf-8")) if body else None
        self.calls.append(
            {
                "url": url,
                "method": method,
                "headers": dict(headers),
                "body": parsed_body,
                "timeout": timeout,
            }
        )
        if self.error is not None:
            raise self.error
        if self.result is not _UNSET:
            return self.result
        response_body = (
            self.raw_body
            if self.raw_body is not _UNSET
            else json.dumps(self.response).encode("utf-8")
        )
        return self.status, {"content-type": "application/json"}, response_body


class SequenceTransport(FakeTransport):
    def __init__(self, responses):
        super().__init__({})
        self.responses = list(responses)

    def __call__(self, url, method, headers, body, timeout):
        self.response = self.responses.pop(0)
        return super().__call__(url, method, headers, body, timeout)


class NexezPythonSdkTest(unittest.TestCase):
    def test_searches_with_query_location_limit_and_preserved_base_path(self):
        transport = FakeTransport({"schema_version": "nexez.agent-search.v1", "results": []})

        search_nexez(
            "strategy session",
            base_url="https://agent.example/runtime/",
            transport=transport,
            location="Chicago, IL",
            limit=3,
            lat=41.88,
            lng=-87.63,
        )

        self.assertEqual(
            transport.calls[0]["url"],
            "https://agent.example/runtime/api/agent-search?"
            "q=strategy+session&limit=3&location=Chicago%2C+IL&lat=41.88&lng=-87.63",
        )
        self.assertEqual(transport.calls[0]["method"], "GET")
        self.assertEqual(transport.calls[0]["timeout"], 15.0)
        self.assertEqual(
            transport.calls[0]["headers"]["user-agent"],
            f"nexez-agent-sdk-python/{__version__}",
        )

    def test_rejects_invalid_search_arguments(self):
        transport = FakeTransport({"results": []})
        invalid_calls = [
            (("   ",), {}, ValueError),
            (("query",), {"limit": True}, TypeError),
            (("query",), {"limit": 0}, ValueError),
            (("query",), {"limit": 51}, ValueError),
            (("query",), {"location": ""}, ValueError),
            (("query",), {"lat": math.nan}, ValueError),
            (("query",), {"lat": 91}, ValueError),
            (("query",), {"lng": -181}, ValueError),
        ]
        for args, kwargs, error_type in invalid_calls:
            with self.subTest(args=args, kwargs=kwargs):
                with self.assertRaises(error_type):
                    search_nexez(*args, transport=transport, **kwargs)
        self.assertEqual(transport.calls, [])

    def test_fetches_agent_page_manifest_by_slug(self):
        transport = FakeTransport(
            {"schema_version": "nexez.agent-page.v1", "page": {"slug": "acme"}, "offers": []}
        )

        manifest = get_agent_page("acme", base_url="https://nexez.test", transport=transport)

        self.assertEqual(manifest["page"]["slug"], "acme")
        self.assertEqual(transport.calls[0]["url"], "https://nexez.test/acme/agent.json")

    def test_rejects_noncanonical_manifest_slugs_before_fetching(self):
        transport = FakeTransport({})

        for slug in ("../secret", "..", "UPPER", "space slug", "acme%2Fsecret", "acme_slug"):
            with self.subTest(slug=slug):
                with self.assertRaisesRegex(ValueError, "Invalid Nexez slug"):
                    get_agent_page(slug, transport=transport)
        self.assertEqual(transport.calls, [])

    def test_validates_base_url_timeout_and_transport(self):
        client = create_client(base_url="https://nexez.test/prefix/")
        self.assertEqual(client.base_url, "https://nexez.test/prefix")

        for value in (
            "ftp://nexez.test",
            "https://user:secret@nexez.test",
            "https://nexez.test?query=1",
            "https://nexez.test#fragment",
            "https://nexez.test/bad path",
        ):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    create_client(base_url=value)
        for value in (0, -1, math.inf, math.nan):
            with self.subTest(timeout=value):
                with self.assertRaises(ValueError):
                    create_client(timeout=value)
        with self.assertRaises(TypeError):
            create_client(timeout=True)
        with self.assertRaises(TypeError):
            create_client(transport="not-callable")

    def test_dry_runs_checkout_forces_safety_and_injects_aliases(self):
        transport = FakeTransport({"ok": True, "checkoutUrl": "https://nexez.test/checkout/acme"})
        client = create_client(base_url="https://nexez.test", transport=transport, buyer_agent="buyer-bot")

        client.validate_checkout(
            {
                "slug": "acme",
                "offer": "services-0",
                "dryRun": False,
                "userApproved": True,
                "user_approved": False,
            },
            query="book this",
            buyer_email="buyer@example.com",
        )

        self.assertEqual(transport.calls[0]["method"], "POST")
        self.assertEqual(
            transport.calls[0]["body"],
            {
                "slug": "acme",
                "offer": "services-0",
                "query": "book this",
                "buyerEmail": "buyer@example.com",
                "buyerAgent": "buyer-bot",
                "dryRun": True,
            },
        )
        self.assertNotIn("userApproved", transport.calls[0]["body"])
        self.assertNotIn("user_approved", transport.calls[0]["body"])

    def test_rejects_invalid_action_payloads_before_transport(self):
        transport = FakeTransport({})
        invalid_calls = [
            (lambda: validate_checkout("not-a-mapping", transport=transport), TypeError),
            (lambda: validate_checkout(offer="services-0", transport=transport), TypeError),
            (lambda: validate_checkout(slug="Acme", offer="services-0", transport=transport), ValueError),
            (lambda: validate_checkout(slug="acme", transport=transport), TypeError),
            (
                lambda: validate_negotiation(
                    slug="acme",
                    offer="services-0",
                    requested_terms="not-a-mapping",
                    transport=transport,
                ),
                TypeError,
            ),
        ]
        for call, error_type in invalid_calls:
            with self.subTest(error_type=error_type):
                with self.assertRaises(error_type):
                    call()
        self.assertEqual(transport.calls, [])

    def test_start_checkout_requires_separate_approval_and_exposes_live_fields(self):
        response = {
            "url": "https://checkout.stripe.test/session",
            "provider": "stripe",
            "checkoutSessionId": "cs_123",
        }
        transport = FakeTransport(response)
        payload = {
            "slug": "acme",
            "offer": "services-0",
            "userApproved": True,
            "user_approved": False,
            "dryRun": True,
        }

        with self.assertRaisesRegex(ValueError, "explicit buyer approval"):
            start_checkout(payload, transport=transport)
        with self.assertRaisesRegex(ValueError, "explicit buyer approval"):
            start_checkout(payload, user_approved=1, transport=transport)
        self.assertEqual(transport.calls, [])

        started = start_checkout(payload, user_approved=True, transport=transport)
        self.assertEqual(started["url"], response["url"])
        self.assertEqual(started["checkoutSessionId"], "cs_123")
        self.assertEqual(transport.calls[0]["body"]["dryRun"], False)
        self.assertNotIn("userApproved", transport.calls[0]["body"])
        self.assertNotIn("user_approved", transport.calls[0]["body"])

    def test_dry_runs_negotiation_validation(self):
        transport = FakeTransport({"ok": True, "dryRun": True})

        validate_negotiation(
            {"slug": "acme", "offer": "services-0", "dry_run": False},
            base_url="https://nexez.test",
            transport=transport,
            budget="USD 800",
            requested_terms={"scope": "Audit"},
        )

        self.assertEqual(transport.calls[0]["url"], "https://nexez.test/api/negotiations")
        self.assertEqual(
            transport.calls[0]["body"],
            {
                "slug": "acme",
                "offer": "services-0",
                "budget": "USD 800",
                "requestedTerms": {"scope": "Audit"},
                "dryRun": True,
            },
        )

    def test_submit_negotiation_requires_separate_approval_and_forces_dry_run_false(self):
        transport = FakeTransport({"ok": True, "negotiationId": "neg_123"})
        payload = {
            "slug": "acme",
            "offer": "services-0",
            "userApproved": True,
            "user_approved": False,
            "dryRun": True,
        }

        with self.assertRaisesRegex(ValueError, "explicit buyer approval"):
            submit_negotiation(payload, transport=transport)
        self.assertEqual(transport.calls, [])

        submit_negotiation(
            payload,
            budget="USD 900",
            user_approved=True,
            base_url="https://nexez.test",
            transport=transport,
        )

        self.assertEqual(transport.calls[0]["body"]["slug"], "acme")
        self.assertEqual(transport.calls[0]["body"]["dryRun"], False)
        self.assertNotIn("userApproved", transport.calls[0]["body"])
        self.assertNotIn("user_approved", transport.calls[0]["body"])

    def test_get_negotiation_status_encodes_credentials_and_redacts_error_url(self):
        token = "secret token/+"
        transport = FakeTransport({"error": "Nope"}, status=404)

        with self.assertRaises(NexezApiError) as context:
            get_negotiation_status(
                "neg_123",
                token,
                base_url="https://nexez.test/runtime",
                transport=transport,
            )

        self.assertEqual(
            transport.calls[0]["url"],
            "https://nexez.test/runtime/api/negotiations/status?"
            "id=neg_123&token=secret+token%2F%2B",
        )
        self.assertNotIn("secret", context.exception.url)
        self.assertIn("token=REDACTED", context.exception.url)
        self.assertEqual(context.exception.body, {"error": "Nope"})

    def test_waits_for_negotiation_decision_until_pending_is_false(self):
        transport = SequenceTransport(
            [
                {"id": "neg_123", "decisionPending": True, "decisionSeq": 0},
                {
                    "id": "neg_123",
                    "decisionPending": False,
                    "decisionSeq": 1,
                    "decision": {"action": "counter"},
                },
            ]
        )

        with patch("nexez_agent_sdk.time.sleep") as sleep:
            result = wait_for_negotiation_decision(
                "neg_123",
                "secret-token",
                timeout=1,
                poll_interval=0.1,
                request_timeout=0.25,
                transport=transport,
            )

        self.assertEqual(result["decisionSeq"], 1)
        self.assertEqual(len(transport.calls), 2)
        self.assertEqual(sleep.call_count, 1)
        self.assertTrue(all(0 < call["timeout"] <= 0.25 for call in transport.calls))

    def test_wait_is_bounded_and_never_leaks_status_token(self):
        transport = FakeTransport({"id": "neg_123", "decisionPending": True})
        with patch("nexez_agent_sdk.time.monotonic", side_effect=[0.0, 0.0, 0.6]):
            with self.assertRaises(TimeoutError) as context:
                wait_for_negotiation_decision(
                    "neg_123",
                    "secret-token",
                    timeout=0.5,
                    poll_interval=0.1,
                    transport=transport,
                )
        self.assertNotIn("secret-token", str(context.exception))
        self.assertEqual(transport.calls[0]["timeout"], 0.5)

        with self.assertRaises(ValueError):
            wait_for_negotiation_decision(
                "neg_123",
                "token",
                timeout=NEXEZ_MAX_DECISION_WAIT_SECONDS + 1,
                transport=transport,
            )
        with self.assertRaises(ValueError):
            wait_for_negotiation_decision(
                "neg_123",
                "token",
                poll_interval=0,
                transport=transport,
            )

    def test_wait_rejects_invalid_status_success_shape(self):
        transport = FakeTransport({"id": "neg_123", "status": "negotiation"})
        with self.assertRaises(NexezProtocolError) as context:
            wait_for_negotiation_decision(
                "neg_123",
                "secret-token",
                timeout=1,
                transport=transport,
            )
        self.assertNotIn("secret-token", context.exception.url)
        self.assertEqual(context.exception.status, 200)

    def test_wraps_transport_exceptions_without_leaking_sensitive_url(self):
        transport = FakeTransport(error=OSError("network down"))
        with self.assertRaises(NexezTransportError) as context:
            get_negotiation_status("neg_123", "secret-token", transport=transport)
        self.assertIsInstance(context.exception.cause, OSError)
        self.assertNotIn("secret-token", context.exception.url)
        self.assertNotIn("secret-token", str(context.exception))

    def test_rejects_invalid_custom_transport_results(self):
        invalid_results = [
            [200, {}, b"{}"],
            (True, {}, b"{}"),
            (200, [], b"{}"),
            (200, {}, "{}"),
        ]
        for result in invalid_results:
            with self.subTest(result=result):
                transport = FakeTransport(result=result)
                with self.assertRaises(NexezTransportError):
                    search_nexez("query", transport=transport)

    def test_rejects_non_object_success_responses(self):
        for raw_body in (b"", b"[]", b"null", b"not-json"):
            with self.subTest(raw_body=raw_body):
                transport = FakeTransport(raw_body=raw_body)
                with self.assertRaises(NexezProtocolError) as context:
                    search_nexez("query", transport=transport)
                self.assertEqual(context.exception.status, 200)

    def test_raises_api_error_with_plain_text_response_body(self):
        transport = FakeTransport(status=503, raw_body=b"temporarily unavailable")

        with self.assertRaises(NexezApiError) as context:
            validate_checkout(slug="missing", offer="services-0", transport=transport)

        self.assertEqual(context.exception.status, 503)
        self.assertEqual(context.exception.body, "temporarily unavailable")


if __name__ == "__main__":
    unittest.main()
