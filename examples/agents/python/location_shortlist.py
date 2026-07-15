from __future__ import annotations

import os
from typing import Any, Dict, List

from nexez_agent_sdk import NexezApiError, create_client


def main() -> None:
    nexez = create_client(buyer_agent="nexez-location-shortlist-example")

    buyer_intent = os.getenv("NEXEZ_BUYER_INTENT", "find a remote AI workflow consultant under 3000")
    buyer_location = os.getenv("NEXEZ_BUYER_LOCATION", "Chicago, IL")
    buyer_budget = os.getenv("NEXEZ_BUYER_BUDGET", "USD 2500")

    matches = nexez.search(buyer_intent, location=buyer_location, limit=8)
    candidates: List[Dict[str, Any]] = []

    unique_results = []
    seen_slugs = set()
    for result in matches.get("results", []):
        slug = result["page"]["slug"]
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        unique_results.append(result)
    for result in unique_results[:5]:
        manifest = nexez.get_agent_page(result["page"]["slug"])
        offer_key = (result.get("offer") or {}).get("key") or (manifest.get("offers") or [{}])[0].get("key") or "services-0"
        offer = next((item for item in manifest.get("offers", []) if item.get("key") == offer_key), None)
        if offer is None and manifest.get("offers"):
            offer = manifest["offers"][0]

        candidates.append(
            {
                "result": result,
                "manifest": manifest,
                "offer": offer,
                "score": score_candidate(result, manifest),
            }
        )

    shortlist = sorted([item for item in candidates if item.get("offer")], key=lambda item: item["score"], reverse=True)[:3]

    print(
        {
            "query": buyer_intent,
            "location": buyer_location,
            "shortlist": [
                {
                    "score": item["score"],
                    "page": item["result"]["page"]["name"],
                    "slug": item["result"]["page"]["slug"],
                    "seller_location": item["result"]["page"].get("location") or item["manifest"]["page"].get("location"),
                    "offer": item["offer"].get("name"),
                    "price": item["offer"].get("price"),
                    "agent_json": item["result"]["page"]["agent_json_url"],
                }
                for item in shortlist
            ],
        }
    )

    if not shortlist:
        print("No actionable Nexez page found for this buyer intent.")
        return

    top = shortlist[0]
    offer = top["offer"]
    supports_negotiation = bool(offer.get("negotiation_action"))

    if supports_negotiation:
        validation = nexez.validate_negotiation(
            slug=top["result"]["page"]["slug"],
            offer=offer["key"],
            query=buyer_intent,
            budget=buyer_budget,
            timeline="next 2 weeks",
            requested_terms={
                "location": buyer_location,
                "approvalBoundary": "Dry-run only. Do not contact seller until buyer approves.",
            },
        )
        recommended_next_step = "ask buyer to approve negotiation submission"
    else:
        validation = nexez.validate_checkout(
            slug=top["result"]["page"]["slug"],
            offer=offer["key"],
            query=buyer_intent,
            buyer_reference=f"location:{buyer_location}",
        )
        recommended_next_step = "ask buyer to approve checkout handoff"

    print(
        {
            "recommended_next_step": recommended_next_step,
            "selected_page": top["result"]["page"]["slug"],
            "selected_offer": offer["key"],
            "dry_run": validation,
        }
    )


def score_candidate(result: Dict[str, Any], manifest: Dict[str, Any]) -> int:
    offers = manifest.get("offers") or []
    location_signal = float((result.get("location_match") or {}).get("confidence") or 0) * 12
    action_signal = 10 if (result.get("offer") or {}).get("action") or any(item.get("action") or item.get("negotiation_action") for item in offers) else 0
    price_signal = 6 if (result.get("offer") or {}).get("price") or any(item.get("price") for item in offers) else 0
    faq_signal = 3 if manifest.get("faqs") else 0
    readiness = manifest.get("certification", {}).get("readiness", 0)
    readiness_signal = readiness / 10 if isinstance(readiness, (int, float)) else 0

    return round(float(result.get("score") or 0) + location_signal + action_signal + price_signal + faq_signal + readiness_signal)


if __name__ == "__main__":
    try:
        main()
    except NexezApiError as error:
        print({"error": str(error), "status": error.status, "body": error.body})
