from enum import StrEnum


class Chronotype(StrEnum):
    LARK = "lark"  # жаворонок
    DOVE = "dove"  # голубь
    OWL = "owl"  # сова


class TaskType(StrEnum):
    INTELLECTUAL = "intellectual"
    PHYSICAL = "physical"
    SOCIAL_CREATIVE = "social_creative"
    ROUTINE = "routine"
