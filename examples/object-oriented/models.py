class Engine:
    """A minimal engine with an observable constructor value."""
    def __init__(self):
        self.power = 120

    def start(self):
        return "running"


class Car:
    """Composition through an explicit Engine() construction."""
    wheels = 4

    def __init__(self):
        self.engine = Engine()
        self.speed = 0

    def drive(self):
        status = self.engine.start()
        return status
