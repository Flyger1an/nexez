import json
from urllib.request import Request, urlopen

from nexez_agent_sdk import NexezApiError, create_client


def fetch_json(url: str) -> dict:
    request = Request(url, headers={"accept": "application/json", "user-agent": "nexez-python-example"})
    with urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    nexez = create_client(buyer_agent="nexez-python-example")

    slug = "nexez-agent-negotiation-lab"
    offer = "services-0"
    proposal = {
        "slug": slug,
        "offer": offer,
        "query": "Buyer wants a one-week agent negotiation sprint.",
        "budget": "USD 2100",
        "timeline": "next week",
        "contact": "buyer@example.com",
        "requested_terms": {
            "scope": "Discovery call, agent-readable offer review, and dry-run guidance.",
        },
    }

    dry_run = nexez.validate_negotiation(proposal)
    print({"dry_run": dry_run})

    # In a real buyer agent, stop here and ask the buyer:
    # "Approve sending this proposal to the seller?"
    approved_by_buyer = False
    if not approved_by_buyer:
        print("Buyer approval required before submit_negotiation.")
        return

    submitted = nexez.submit_negotiation(proposal)
    print({"submitted": submitted})

    status_url = submitted.get("statusUrl")
    if status_url:
        print({"status": fetch_json(status_url)})


if __name__ == "__main__":
    try:
        main()
    except NexezApiError as error:
        print({"error": str(error), "status": error.status, "body": error.body})
