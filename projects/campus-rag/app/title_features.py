"""Bounded caches of pure text features, never permissions or evidence."""
import math
import re
from collections import Counter
from functools import lru_cache
from types import MappingProxyType

GENERIC_TITLE = r'南京晓庄学院|学校|关于|通知|通告|公告|报名|组织|开展|有关|工作|事宜|20\d{2}年?|\d+月'


@lru_cache(maxsize=32768)
def title_terms(title):
    from .rag import ranking_terms
    return frozenset(ranking_terms(re.sub(GENERIC_TITLE, ' ', title)))


@lru_cache(maxsize=2)
def title_weights(titles):
    # The exact current corpus of titles is the key. Import, rename, withdrawal,
    # and visibility changes alter the input; no TTL or stale authorization.
    frequency = Counter(term for title in titles for term in title_terms(title))
    return MappingProxyType({term: math.log(1 + len(titles)/(n+1))
                             for term, n in frequency.items()})
