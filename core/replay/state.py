import copy
from typing import List, Dict, Any, Optional
from core.execution.models import AccountState, ReplaySnapshot


class ReplayStateStore:
    """
    State container and event sourcing manager for ReplayEngine.
    """
    def __init__(self, session_id: str, initial_balance: float = 10000.0, leverage: float = 100.0):
        self.session_id: str = session_id
        self.account: AccountState = AccountState(
            initial_balance=initial_balance,
            balance=initial_balance,
            equity=initial_balance,
            free_margin=initial_balance,
            leverage=leverage
        )
        self.positions: List[Dict[str, Any]] = []
        self.pending_orders: List[Dict[str, Any]] = []
        self.trade_history: List[Dict[str, Any]] = []
        self.drawings: List[Dict[str, Any]] = []
        
        # Event history for event-sourcing / deterministic rewind
        self.events: List[Dict[str, Any]] = []
        self.snapshots: Dict[int, ReplaySnapshot] = {}

    def record_event(self, event_type: str, data: Dict[str, Any], timestamp: int, cursor_index: int):
        event = {
            "type": event_type,
            "data": data,
            "timestamp": timestamp,
            "cursor_index": cursor_index
        }
        self.events.append(event)

    def save_snapshot(self, cursor_index: int, current_time: int):
        """Creates a deep-copy snapshot of current replay state at cursor_index."""
        snapshot = ReplaySnapshot(
            session_id=self.session_id,
            cursor_index=cursor_index,
            current_time=current_time,
            account=copy.deepcopy(self.account),
            positions=copy.deepcopy(self.positions),
            pending_orders=copy.deepcopy(self.pending_orders),
            trade_history=copy.deepcopy(self.trade_history),
            drawings=copy.deepcopy(self.drawings)
        )
        self.snapshots[cursor_index] = snapshot

    def get_latest_snapshot_before(self, target_index: int) -> Optional[ReplaySnapshot]:
        """Finds the latest snapshot created at or before target_index."""
        matching_indices = [idx for idx in self.snapshots.keys() if idx <= target_index]
        if not matching_indices:
            return None
        latest_idx = max(matching_indices)
        return copy.deepcopy(self.snapshots[latest_idx])

    def restore_from_snapshot(self, snapshot: ReplaySnapshot):
        """Restores state from a saved snapshot."""
        self.account = copy.deepcopy(snapshot.account)
        self.positions = copy.deepcopy(snapshot.positions)
        self.pending_orders = copy.deepcopy(snapshot.pending_orders)
        self.trade_history = copy.deepcopy(snapshot.trade_history)
        self.drawings = copy.deepcopy(snapshot.drawings)

    def reset_to_initial(self):
        """Resets state back to session initialization."""
        self.account = AccountState(
            initial_balance=self.account.initial_balance,
            balance=self.account.initial_balance,
            equity=self.account.initial_balance,
            free_margin=self.account.initial_balance,
            leverage=self.account.leverage
        )
        self.positions = []
        self.pending_orders = []
        self.trade_history = []
        self.events = []
        self.snapshots = {}
