from __future__ import annotations

import json
import os
from typing import Any, Dict

from nexez_agent_sdk import NexezApiError, create_client


def main() -> None:
    nexez = create_client(buyer_agent="nexez-buyer-approval-example")

    proposal = {
        "slug": os.getenv("NEXEZ_APPROVAL_SLUG", "nexez-agent-negotiation-lab"),
        "offer": os.getenv("NEXEZ_APPROVAL_OFFER", "services-0"),
        "query": os.getenv("NEXEZ_APPROVAL_QUERY", "Buyer wants a one-week agent negotiation sprint."),
        "budget": os.getenv("NEXEZ_APPROVAL_BUDGET", "USD 2100"),
        "timeline": os.getenv("NEXEZ_APPROVAL_TIMELINE", "next week"),
        "contact": os.getenv("NEXEZ_APPROVAL_CONTACT", "buyer@example.com"),
        "requested_terms": {
            "scope": "Discovery call, agent-readable offer review, and dry-run guidance.",
        },
    }

    manifest = nexez.get_agent_page(proposal["slug"])
    offer = next((item for item in manifest.get("offers", []) if item.get("key") == proposal["offer"]), None)
    if not offer:
        print(f"Offer {proposal['offer']} was not found on {proposal['slug']}.")
        return

    if offer.get("negotiation_action"):
        dry_run = nexez.validate_negotiation(proposal)
        action_type = "submit_negotiation"
    else:
        dry_run = nexez.validate_checkout(
            slug=proposal["slug"],
            offer=proposal["offer"],
            query=proposal["query"],
            buyer_email=proposal["contact"],
        )
        action_type = "open_checkout"

    approval = build_buyer_approval_summary(
        action_type=action_type,
        manifest=manifest,
        offer=offer,
        proposal=proposal,
        dry_run=dry_run,
    )

    print(json.dumps(approval, indent=2))

    # In a real buyer agent, render approval["buyer_copy"] and wait for an
    # explicit buyer click/tap/voice confirmation before performing the next action.
    approved_by_buyer = False
    if not approved_by_buyer:
        print("Stopped: buyer approval is required before any side effect.")
        return

    if approval["action_type"] == "submit_negotiation":
        submitted = nexez.submit_negotiation(proposal)
        print({"submitted": submitted})
    else:
        print({"open_checkout_url": offer.get("checkout_url")})


def build_buyer_approval_summary(
    *,
    action_type: str,
    manifest: Dict[str, Any],
    offer: Dict[str, Any],
    proposal: Dict[str, Any],
    dry_run: Dict[str, Any],
) -> Dict[str, Any]:
    seller_name = manifest["page"]["name"]
    offer_price = offer.get("price") or "price not listed"
    is_negotiation = action_type == "submit_negotiation"
    action_label = "Approve negotiation submission" if is_negotiation else "Approve checkout handoff"
    action_description = "send this proposal to the seller" if is_negotiation else "open the seller checkout or booking flow"

    return {
        "schema_version": "nexez.buyer-approval.v1",
        "requires_buyer_approval": True,
        "action_type": action_type,
        "seller": {
            "name": seller_name,
            "slug": manifest["page"]["slug"],
            "public_url": manifest["page"]["url"],
            "website_url": manifest["page"].get("website_url"),
            "location": manifest["page"].get("location"),
        },
        "offer": {
            "key": offer["key"],
            "name": offer["name"],
            "price": offer_price,
            "summary": offer.get("voice_summary") or offer.get("description"),
            "checkout_url": offer.get("checkout_url"),
        },
        "proposal": {
            "query": proposal["query"],
            "budget": proposal["budget"],
            "timeline": proposal["timeline"],
            "requested_terms": proposal.get("requested_terms"),
            "contact_shared": bool(proposal.get("contact")),
        },
        "dry_run": dry_run,
        "risk_notes": [
            "No money should move before the buyer approves.",
            "No buyer contact details should be sent before approval.",
            "Dry-run validation is safe; real checkout, booking, contact, or negotiation submission is not.",
        ],
        "buyer_copy": {
            "title": f"{seller_name} - {offer['name']}",
            "body": (
                f"I found {offer['name']} from {seller_name} at {offer_price}. "
                f"I can {action_description} using your budget ({proposal['budget']}) "
                f"and timeline ({proposal['timeline']})."
            ),
            "confirmation_question": f"Do you approve this {'proposal submission' if is_negotiation else 'checkout handoff'}?",
            "approve_label": action_label,
            "cancel_label": "Cancel",
        },
    }


if __name__ == "__main__":
    try:
        main()
    except NexezApiError as error:
        print({"error": str(error), "status": error.status, "body": error.body})
