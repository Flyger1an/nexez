from nexez_agent_sdk import NexezApiError, create_client


def main() -> None:
    nexez = create_client(buyer_agent="nexez-python-example")

    matches = nexez.search("remote launch strategy consultant under 3000", limit=5, location="Remote")
    if not matches.get("results"):
        print("No Nexez matches found.")
        return

    first = matches["results"][0]
    slug = first["page"]["slug"]
    offer_key = (first.get("offer") or {}).get("key", "services-0")

    page = nexez.get_agent_page(slug)
    offer = next((item for item in page.get("offers", []) if item.get("key") == offer_key), None)
    if not offer:
        print(f"Page {slug} loaded, but offer {offer_key} was not found.")
        return

    if offer.get("negotiation_action"):
        validation = nexez.validate_negotiation(
            slug=slug,
            offer=offer_key,
            query="Buyer wants a remote launch strategy engagement under 3000.",
            budget="USD 2500",
            timeline="next two weeks",
        )
        action = "negotiation"
    else:
        validation = nexez.validate_checkout(
            slug=slug,
            offer=offer_key,
            query="Buyer wants to validate checkout before booking.",
        )
        action = "checkout"

    print(
        {
            "page": slug,
            "offer": offer_key,
            "action": action,
            "validation_ok": validation.get("ok"),
            "dry_run": validation.get("dryRun", True),
        }
    )


if __name__ == "__main__":
    try:
        main()
    except NexezApiError as error:
        print({"error": str(error), "status": error.status, "body": error.body})
