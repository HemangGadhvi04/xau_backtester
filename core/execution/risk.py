from core.execution.models import AccountState


def calculate_required_margin(
    price: float,
    lots: float,
    contract_size: float = 100.0,
    leverage: float = 100.0
) -> float:
    """
    Calculates required margin for an order or position.
    """
    return (price * lots * contract_size) / leverage


def check_margin_available(
    account: AccountState,
    price: float,
    lots: float,
    contract_size: float = 100.0
) -> bool:
    """
    Returns True if free margin is sufficient to open the position.
    """
    required_margin = calculate_required_margin(price, lots, contract_size, account.leverage)
    return account.free_margin >= required_margin
