"""Project-specific exceptions used by the downloader service classes."""


class DownloaderError(RuntimeError):
    """Base error for expected application failures."""


class ConfigurationError(DownloaderError):
    """Raised when required environment or CLI settings are missing."""


class AlpacaAPIError(DownloaderError):
    """Raised when Alpaca's REST API returns an unsuccessful response."""


class DatabaseError(DownloaderError):
    """Raised when database setup or persistence cannot be completed."""
