import time
from collections import defaultdict

from flask import Blueprint, jsonify, request
from services.auth_service import generate_nonce, verify_and_authenticate

auth_bp = Blueprint("auth", __name__)

# Simple in-memory rate limiter: max 10 requests per minute per IP
_nonce_requests: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10
_RATE_WINDOW = 60  # seconds


@auth_bp.route("/nonce", methods=["GET"])
def get_nonce():
    ip = request.remote_addr or "unknown"
    now = time.time()
    _nonce_requests[ip] = [t for t in _nonce_requests[ip] if now - t < _RATE_WINDOW]
    if len(_nonce_requests[ip]) >= _RATE_LIMIT:
        return jsonify({"error": "Too many requests"}), 429
    _nonce_requests[ip].append(now)

    address = request.args.get("address", "").strip()
    if not address.startswith("0x") or len(address) != 42:
        return jsonify({"error": "Invalid wallet address"}), 400

    nonce = generate_nonce(address)
    return jsonify({
        "nonce": nonce,
        "message": f"Sign in to RavenX\nNonce: {nonce}",
    })


@auth_bp.route("/verify", methods=["POST"])
def verify():
    body = request.get_json() or {}
    address = body.get("address", "").strip()
    signature = body.get("signature", "").strip()

    if not address or not signature:
        return jsonify({"error": "address and signature required"}), 400

    token = verify_and_authenticate(address, signature)
    if not token:
        return jsonify({"error": "Invalid or expired signature"}), 401

    return jsonify({"access_token": token})
