from .models import CreditPolicy, Customer
from .utils import normalize, summarize


class CreditService:
    """Follow a customer from input through normalization and policy."""
    def __init__(self):
        self.policy = CreditPolicy()
        self.processed = 0

    def process(self, customer: Customer):
        income = customer.income
        normalized = normalize(income)
        score = self.policy.evaluate(normalized)
        if score > 0.7:
            decision = "review"
        else:
            decision = "keep"
        return decision

    def batch(self, customers):
        scores = []
        for customer in customers:
            score = normalize(customer.income)
            scores.append(score)
        return summarize(scores)
