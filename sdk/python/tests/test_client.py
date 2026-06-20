import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from nexez_agent_sdk import (  # noqa: E402
    NexezApiError,
    create_client,
    get_agent_page,
    search_nexez,
    submit_negotiation,
    validate_checkout,
    validate_negotiation,
)


class FakeTransport:
    def __init__(self, response, status=200):
        self.response = response
        self.status = status
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
        return self.status, {"content-type": "application/json"}, json.dumps(self.response).encode("utf-8")


class NexezPythonSdkTest(unittest.TestCase):
    def test_searches_with_query_location_and_limit(self):
        transport = FakeTransport({"schema_version": "nexez.agent-search.v1", "results": []})

        search_nexez(
            "strategy session",
            base_url="https://agent.example/",
            transport=transport,
            location="Chicago, IL",
            limit=3,
        )

        self.assertEqual(
            transport.calls[0]["url"],
            "https://agent.example/api/agent-search?q=strategy+session&limit=3&location=Chicago%2C+IL",
        )
        self.assertEqual(transport.calls[0]["method"], "GET")

    def test_fetches_agent_page_manifest_by_slug(self):
        transport = FakeTransport({"schema_version": "nexez.agent-page.v1", "page": {"slug": "acme"}, "offers": []})

        manifest = get_agent_page("acme", base_url="https://nexez.test", transport=transport)

        self.assertEqual(manifest["page"]["slug"], "acme")
        self.assertEqual(transport.calls[0]["url"], "https://nexez.test/acme/agent.json")

    def test_rejects_unsafe_manifest_slugs_before_fetching(self):
        transport = FakeTransport({})

        with self.assertRaisesRegex(ValueError, "Invalid Nexez slug"):
            get_agent_page("../secret", transport=transport)

        self.assertEqual(len(transport.calls), 0)

    def test_dry_runs_checkout_and_injects_buyer_agent(self):
        transport = FakeTransport({"ok": True, "checkoutUrl": "https://nexez.test/checkout/acme"})
        client = create_client(base_url="https://nexez.test", transport=transport, buyer_agent="buyer-bot")

        client.validate_checkout(slug="acme", offer="services-0", query="book this")

        self.assertEqual(transport.calls[0]["url"], "https://nexez.test/api/checkout")
        self.assertEqual(transport.calls[0]["method"], "POST")
        self.assertEqual(
            transport.calls[0]["body"],
            {
                "slug": "acme",
                "offer": "services-0",
                "query": "book this",
                "buyerAgent": "buyer-bot",
                "dryRun": True,
            },
        )

    def test_dry_runs_negotiation_validation(self):
        transport = FakeTransport({"ok": True, "dryRun": True})

        validate_negotiation(
            {"slug": "acme", "offer": "services-0"},
            base_url="https://nexez.test",
            transport=transport,
            budget="USD 800",
        )

        self.assertEqual(transport.calls[0]["url"], "https://nexez.test/api/negotiations")
        self.assertEqual(
            transport.calls[0]["body"],
            {"slug": "acme", "offer": "services-0", "budget": "USD 800", "dryRun": True},
        )

    def test_submits_negotiation_without_forcing_dry_run(self):
        transport = FakeTransport({"ok": True, "negotiationId": "neg_123"})

        submit_negotiation(
            slug="acme",
            offer="services-0",
            budget="USD 900",
            base_url="https://nexez.test",
            transport=transport,
        )

        self.assertEqual(transport.calls[0]["body"]["slug"], "acme")
        self.assertEqual(transport.calls[0]["body"]["offer"], "services-0")
        self.assertNotIn("dryRun", transport.calls[0]["body"])

    def test_raises_error_with_status_and_response_body(self):
        transport = FakeTransport({"error": "Nope"}, status=404)

        with self.assertRaises(NexezApiError) as ctx:
            validate_checkout(slug="missing", offer="services-0", transport=transport)

        self.assertEqual(ctx.exception.status, 404)
        self.assertEqual(ctx.exception.body, {"error": "Nope"})


if __name__ == "__main__":
    unittest.main()
