from nexez_agent_sdk import NexezApiError, create_client
from uuid import uuid4


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

    submitted = nexez.submit_negotiation(
        proposal,
        contact="buyer@example.com",
        approval_token=dry_run.get("approvalToken"),
        user_approved=True,
        idempotency_key=uuid4().hex,
    )
    print(
        {
            "submitted": {
                "ok": submitted.get("ok"),
                "status": submitted.get("status"),
                "negotiationId": submitted.get("negotiationId"),
                "decisionPending": submitted.get("decisionPending"),
            }
        }
    )

    negotiation_id = submitted.get("negotiationId")
    status_token = submitted.get("statusToken")
    if negotiation_id and status_token:
        try:
            status = nexez.wait_for_negotiation_decision(
                negotiation_id,
                status_token,
                timeout=30.0,
                poll_interval=2.0,
            )
            print({"status": status})
        except TimeoutError:
            print({"status": "timed_out", "next": "Check this negotiation again later."})


if __name__ == "__main__":
    try:
        main()
    except NexezApiError as error:
        print({"error": str(error), "status": error.status, "body": error.body})
