from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models.user import ParentWallet
from services.agent_service import generate_pending_agent, verify_agent_approved, wallet_agent

agent_bp = Blueprint("agent", __name__)


@agent_bp.route("/generate", methods=["POST"])
@jwt_required()
def generate_agent():
    """The agent to copy with: the wallet's saved one while HL still lists it
    (no signature needed), otherwise a fresh one for the user to approve."""
    parent = get_jwt_identity().lower()
    if not db.session.get(ParentWallet, parent):
        db.session.add(ParentWallet(address=parent))
        db.session.commit()

    saved = wallet_agent(parent)
    if saved and verify_agent_approved(parent, saved.agent_address):
        return jsonify({"agent_address": saved.agent_address, "needs_approval": False}), 200

    addr = generate_pending_agent(parent)
    return jsonify({"agent_address": addr, "needs_approval": True}), 201
