"""Calendar-version evidence and remaining clarification, without policy guesses."""
import re


def calendar_year(question):
    if re.search(r'20\d{2}\s*[—–－\-至]\s*20\d{2}', question):
        return None
    years = set(re.findall(r'20\d{2}', question))
    return int(next(iter(years))) if len(years) == 1 else None


def version_matches(question, title):
    from .semester import semester_key
    wanted = semester_key(question)
    actual = semester_key(title)
    if wanted:
        return actual == wanted
    year = calendar_year(question)
    if year is None:
        return True
    if actual:
        return actual[0] == year
    # Publication date alone is not the notification's applicable year.
    return bool(re.search(rf'(?<!\d){year}(?:年|届)', title))


def remaining_clarification(question, titles):
    from .semester import semester_key
    year = calendar_year(question)
    seasons = sorted({key[1] for t in titles if (key := semester_key(t)) and (year is None or key[0] == year)})
    if year is not None and len(seasons) > 1:
        return f'已确定你问{year}年。你问{year}年春季还是秋季？'
    if year is not None:
        return f'已确定你问{year}年；仍有多个通知版本，请指定所问通知或办理批次。'
    return '查到多个年度或学期的通知。请先补充年份；也可以直接说明完整学年和学期。'
