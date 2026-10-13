from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models.notification import Notification

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("", methods=["GET"])
@jwt_required()
def list_notifications():
    parent = get_jwt_identity()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)

    q = Notification.query.filter_by(parent_address=parent).order_by(
        Notification.created_at.desc()
    )
    pagination = q.paginate(page=page, per_page=per_page, error_out=False)

    unread_count = Notification.query.filter_by(
        parent_address=parent, is_read=False
    ).count()

    return jsonify({
        "notifications": [n.to_dict() for n in pagination.items],
        "unread_count": unread_count,
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
    })


@notifications_bp.route("/unread-count", methods=["GET"])
@jwt_required()
def unread_count():
    parent = get_jwt_identity()
    count = Notification.query.filter_by(
        parent_address=parent, is_read=False
    ).count()
    return jsonify({"unread_count": count})


@notifications_bp.route("/read", methods=["POST"])
@jwt_required()
def mark_read():
    parent = get_jwt_identity()
    body = request.get_json() or {}
    notification_ids = body.get("ids")

    if notification_ids:
        Notification.query.filter(
            Notification.id.in_(notification_ids),
            Notification.parent_address == parent,
        ).update({"is_read": True}, synchronize_session=False)
    else:
        # Mark all as read
        Notification.query.filter_by(
            parent_address=parent, is_read=False
        ).update({"is_read": True}, synchronize_session=False)

    db.session.commit()
    return jsonify({"ok": True})
