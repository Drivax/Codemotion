from dataclasses import dataclass


@dataclass
class Customer:
    income: float
    balance: float


class BasePolicy:
    def evaluate(self, score):
        return score


class CreditPolicy(BasePolicy):
    """A transparent example policy, not financial guidance."""
    threshold = 0.7

    def __init__(self):
        self.multiplier = 1.2

    def evaluate(self, score):
        if score > self.threshold:
            return score * self.multiplier
        return score
