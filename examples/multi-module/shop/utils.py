def normalize(value):
    """Scale a symbolic input. CodeMotion never executes this function."""
    return value / 10000


def summarize(values):
    total = 0
    for value in values:
        total += value
    return total
