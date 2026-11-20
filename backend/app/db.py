"""Connects to MongoDB and GridFS (MongoDB's storage for files).

The app always uses a real MongoDB. If it can't connect, it stops with a
clear error instead of quietly running on a fake database and losing data.
An in-memory database (mongomock) is used only by the unit tests, or when
ALLOW_IN_MEMORY_DB=true is set on purpose.
"""
import re
import time
import logging

from bson import ObjectId
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import PyMongoError
import gridfs
import mongomock

from app.config import Config

logger = logging.getLogger(__name__)


class InMemoryGridFSFile:
    def __init__(self, file_id, data, filename=None, content_type=None):
        self._id = file_id
        self.data = data
        self.filename = filename
        self.content_type = content_type

    def read(self):
        return self.data


class InMemoryGridFS:
    """A tiny fake GridFS for the unit tests (keeps files in memory)."""

    def __init__(self):
        self._storage = {}

    def put(self, data, filename=None, content_type=None, **kwargs):
        file_id = ObjectId()
        if hasattr(data, "read"):
            data = data.read()
        elif isinstance(data, str):
            data = data.encode("utf-8")
        elif not isinstance(data, (bytes, bytearray)):
            data = bytes(data)
        self._storage[str(file_id)] = {"data": data, "filename": filename, "content_type": content_type}
        return file_id

    def get(self, file_id):
        key = str(file_id)
        if key not in self._storage:
            raise KeyError(f"File {file_id} not found in in-memory GridFS")
        entry = self._storage[key]
        return InMemoryGridFSFile(file_id, entry["data"], entry.get("filename"), entry.get("content_type"))

    def delete(self, file_id):
        self._storage.pop(str(file_id), None)


def _mask_uri(uri: str) -> str:
    return re.sub(r"://([^:/@]+):([^@]+)@", r"://\1:****@", uri or "")


INDEXES = [
    ("users", [("email", ASCENDING)], {"unique": True}),
    ("users", [("username", ASCENDING)], {"unique": True}),
    ("documents", [("division", ASCENDING), ("created_at", DESCENDING)], {}),
    ("documents", [("created_at", DESCENDING)], {}),
    ("access_requests", [("doc_id", ASCENDING), ("requested_by_id", ASCENDING), ("status", ASCENDING)], {}),
    ("access_requests", [("doc_division", ASCENDING), ("status", ASCENDING)], {}),
    ("audit_events", [("created_at", ASCENDING)], {}),
    ("audit_events", [("request_id", ASCENDING), ("created_at", ASCENDING)], {}),
    ("metadata_fields", [("name", ASCENDING)], {"unique": True}),
]


def ensure_indexes(db):
    """Create the indexes that keep lookups fast. Safe to run every start-up.

    If one fails (for example old duplicate data blocks a unique index), we
    log it and carry on, rather than stopping the app.
    """
    for collection, keys, options in INDEXES:
        try:
            db[collection].create_index(keys, **options)
        except PyMongoError as err:
            logger.warning("Could not create index %s on %s: %s", keys, collection, err)


class DatabaseManager:
    _instance = None

    def __init__(self):
        self.client = None
        self.db = None
        self.fs = None
        self.is_mock = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = DatabaseManager()
        return cls._instance

    def initialize(self, mongo_uri=None, db_name=None, allow_in_memory=None):
        uri = mongo_uri or Config.MONGO_URI
        name = db_name or Config.MONGO_DB_NAME
        allow_in_memory = Config.ALLOW_IN_MEMORY_DB if allow_in_memory is None else allow_in_memory
        deadline = time.monotonic() + max(Config.MONGO_CONNECT_TIMEOUT_SECONDS, 1)
        attempt, last_error = 0, None

        logger.info("Connecting to MongoDB at %s (database '%s')...", _mask_uri(uri), name)
        while time.monotonic() < deadline:
            attempt += 1
            try:
                client = MongoClient(uri, serverSelectionTimeoutMS=5000)
                client.admin.command("ping")
                self.client = client
                self.db = client[name]
                self.fs = gridfs.GridFS(self.db)
                self.is_mock = False
                ensure_indexes(self.db)
                logger.info("Connected to MongoDB and initialized GridFS (attempt %d).", attempt)
                return
            except PyMongoError as err:
                last_error = err
                logger.warning("MongoDB not reachable yet (attempt %d): %s", attempt, err)
                time.sleep(2)

        if not allow_in_memory:
            raise RuntimeError(
                f"Could not connect to MongoDB at {_mask_uri(uri)}: {last_error}. "
                "Check MONGO_URI (and Atlas network access), or set ALLOW_IN_MEMORY_DB=true for a throwaway demo."
            )

        logger.warning("ALLOW_IN_MEMORY_DB=true: using a non-persistent in-memory database. Data will be lost on restart.")
        self.client = mongomock.MongoClient()
        self.db = self.client[name]
        self.fs = InMemoryGridFS()
        self.is_mock = True


db_manager = DatabaseManager.get_instance()


def get_db():
    if db_manager.db is None:
        db_manager.initialize()
    return db_manager.db


def get_fs():
    if db_manager.fs is None:
        db_manager.initialize()
    return db_manager.fs
