"""Tests de POST /api/webhooks/clerk (ver auth2.md FASE 6/9) — firma Svix
válida/inválida/repetida, y que user.deleted desactiva sin borrar pagos."""

import base64
import json
import secrets as secrets_module
from datetime import datetime, timezone

import pytest
from svix.webhooks import Webhook

from src.load.models import AppUser, PaymentReference, Subscription

# Generado en cada test run (no un literal fijo) para que nunca haya un
# secreto "whsec_..." estático en el código — un scanner de secretos no
# puede distinguirlo de una credencial real solo por el formato.
SECRET = "whsec_" + base64.b64encode(secrets_module.token_bytes(24)).decode()


def _signed_headers(payload_str: str, msg_id: str = "msg_test_1") -> dict:
    timestamp = datetime.now(timezone.utc)
    signature = Webhook(SECRET).sign(msg_id=msg_id, timestamp=timestamp, data=payload_str)
    return {
        "svix-id": msg_id,
        "svix-timestamp": str(int(timestamp.timestamp())),
        "svix-signature": signature,
        "content-type": "application/json",
    }


def _user_event(event_type: str, clerk_id: str, *, email="nuevo@example.com", verified=True) -> str:
    return json.dumps({
        "type": event_type,
        "data": {
            "id": clerk_id,
            "primary_email_address_id": "idn_1",
            "email_addresses": [
                {"id": "idn_1", "email_address": email, "verification": {"status": "verified" if verified else "unverified"}},
            ],
            "first_name": "Nuevo",
            "last_name": "Usuario",
            "image_url": "https://img.clerk.com/pic.png",
        },
    })


@pytest.fixture(autouse=True)
def _configure_secret(monkeypatch):
    monkeypatch.setenv("CLERK_WEBHOOK_SECRET", SECRET)


def test_valid_user_created_creates_app_user(api_client, db_session):
    payload = _user_event("user.created", "user_wh_1")
    resp = api_client.post("/api/webhooks/clerk", content=payload, headers=_signed_headers(payload))

    assert resp.status_code == 200
    user = db_session.query(AppUser).filter_by(auth_provider_user_id="user_wh_1").one()
    assert user.email == "nuevo@example.com"
    assert user.is_active is True


def test_invalid_signature_rejected(api_client):
    payload = _user_event("user.created", "user_wh_bad")
    bad_headers = _signed_headers(payload)
    bad_headers["svix-signature"] = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    resp = api_client.post("/api/webhooks/clerk", content=payload, headers=bad_headers)

    assert resp.status_code == 400


def test_repeated_user_created_event_is_idempotent(api_client, db_session):
    payload = _user_event("user.created", "user_wh_2")
    headers = _signed_headers(payload, msg_id="msg_repeated")

    first = api_client.post("/api/webhooks/clerk", content=payload, headers=headers)
    second = api_client.post("/api/webhooks/clerk", content=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    rows = db_session.query(AppUser).filter_by(auth_provider_user_id="user_wh_2").all()
    assert len(rows) == 1


def test_user_deleted_deactivates_without_touching_payments(api_client, db_session):
    user = AppUser(auth_provider="clerk", auth_provider_user_id="user_wh_3", email="pago@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    sub = Subscription(user_id=user.id, plan="pro", status="active")
    ref = PaymentReference(user_id=user.id, reference="pro-ref-1", plan="monthly", amount_in_cents=14_900_000, status="approved")
    db_session.add_all([sub, ref])
    db_session.commit()

    payload = json.dumps({"type": "user.deleted", "data": {"id": "user_wh_3", "deleted": True}})
    resp = api_client.post("/api/webhooks/clerk", content=payload, headers=_signed_headers(payload))

    assert resp.status_code == 200
    db_session.refresh(user)
    assert user.is_active is False

    # Nunca borra ni modifica pagos/suscripciones.
    db_session.refresh(sub)
    db_session.refresh(ref)
    assert sub.plan == "pro"
    assert sub.status == "active"
    assert ref.status == "approved"


def test_repeated_user_deleted_is_noop(api_client, db_session):
    user = AppUser(auth_provider="clerk", auth_provider_user_id="user_wh_4", email="dos@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    payload = json.dumps({"type": "user.deleted", "data": {"id": "user_wh_4", "deleted": True}})
    first = api_client.post("/api/webhooks/clerk", content=payload, headers=_signed_headers(payload, msg_id="msg_del_1"))
    second = api_client.post("/api/webhooks/clerk", content=payload, headers=_signed_headers(payload, msg_id="msg_del_2"))

    assert first.status_code == 200
    assert second.status_code == 200
    db_session.refresh(user)
    assert user.is_active is False
