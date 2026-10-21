from datetime import datetime
from extensions import db
from models.encrypted import EncryptedText


class AgentWallet(db.Model):
    """The one HL agent a user's wallet has approved for RavenX.

    Every copy on that wallet trades through it. It's approved under a fixed
    name, so re-approving replaces it on HL rather than using another of the
    account's few named-agent slots. The key is encrypted at rest; the agent
    can trade but never withdraw.
    """
    __tablename__ = "agent_wallets"

    parent_address = db.Column(
        db.String(42), db.ForeignKey("parent_wallets.address"), primary_key=True
    )
    agent_address = db.Column(db.String(42), nullable=False)
    agent_private_key = db.Column(EncryptedText, nullable=False)
    approved_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
