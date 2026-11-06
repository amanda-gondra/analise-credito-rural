"""Evaluation set of the assistant (decision D17): does it pick the right tool and filters,
are its numbers the numbers of the database, and does it refuse what is out of scope?

Run with a real provider (uses the free quota, so it is not part of pytest):
    python -m api.evaluation.run --provider gemini
"""
