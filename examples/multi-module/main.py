from shop.models import Customer
from shop.service import CreditService


def main():
    service = CreditService()
    customer = Customer(6000, 200)
    decision = service.process(customer)
    return decision
