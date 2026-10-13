from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models.user import ParentWallet
from services.agent_service import generate_pending_agent

agent_bp = Blueprint("agent", __name__)


@agent_bp.route("/generate", methods=["POST"])
@jwt_required()
def generate_agent():
    parent = get_jwt_identity().lower()
    if not db.session.get(ParentWallet, parent):
        db.session.add(ParentWallet(address=parent))
        db.session.commit()
    addr = generate_pending_agent(parent)
    return jsonify({"agent_address": addr}), 201
