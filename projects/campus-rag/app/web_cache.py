"""Bounded, short-lived public-page caches. Never cache user/teacher answers."""
from collections import OrderedDict
from copy import deepcopy
from threading import Event, Lock
import time

_entries = OrderedDict()
_pending = {}
_lock = Lock()
MAX_ENTRIES = 128


def cached(namespace, key, ttl, loader):
    identity = namespace, key
    while True:
        with _lock:
            item = _entries.get(identity)
            if item and item[0] > time.monotonic():
                _entries.move_to_end(identity)
                return deepcopy(item[1]), True
            _entries.pop(identity, None)
            event = _pending.get(identity)
            if event is None:
                event = _pending[identity] = Event()
                break
        if not event.wait(20):
            raise TimeoutError('公共来源查询繁忙，请稍后重试')
    try:
        value = loader()
        with _lock:
            _entries[identity] = (time.monotonic() + ttl, deepcopy(value))
            while len(_entries) > MAX_ENTRIES:
                _entries.popitem(last=False)
        return value, False
    finally:
        with _lock:
            _pending.pop(identity, None)
            event.set()


def clear():
    with _lock:
        _entries.clear()
