# app/shared/exceptions.py
"""
Custom exception definitions.

Purpose: Encapsulate low-level errors into domain-level exceptions.
Why: Prevent leakage of raw exceptions and enable uniform error handling.
How: Define exception classes to be raised and caught at appropriate layers.
"""

class InfrastructureError(Exception):
    "Raised when an external service call fails unexpectedly." 

class UseCaseError(Exception):
    "Raised when a business use case encounters an error." 