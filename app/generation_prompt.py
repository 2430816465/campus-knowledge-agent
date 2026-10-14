"""Keep full evidence and validation contracts; avoid unrelated elaboration."""
import json
import re

FOCUSED_ANSWER = ('仅问名称、地点、时间或数值时，回答所问及必要限定，不扩写沿革或背景。'
                  '步骤、资格、比较题必须完整保留材料、阶段、条件、例外与日期边界。')


def focused_messages(messages):
    # Strictly limited to single attribute questions. A broad brevity instruction
    # made a real appeal-exception case need repair; procedural prompts stay exact.
    question = None
    for message in messages:
        if message.get('role') == 'user':
            try:
                value = json.loads(message['content'])
                if isinstance(value, dict) and isinstance(value.get('question'), str):
                    question = value['question'].strip()
                    break
            except (ValueError, TypeError):
                pass
    if question is None or not re.fullmatch(
        r'(?:请问)?(?:南京晓庄学院|学校|晓庄)?的?(?:校训|英文名称|英文名|简称)'
        r'(?:是什么|叫什么|是啥)?[？?。\s]*', question):
        return [dict(message) for message in messages]
    result = []
    for message in messages:
        item = dict(message)
        if item.get('role') == 'system':
            item['content'] += '\n' + FOCUSED_ANSWER
        elif item.get('role') == 'user':
            try:
                value = json.loads(item['content'])
                if isinstance(value, dict):
                    # Keep the changing clock last so identical evidence/question
                    # prefixes can be reused by Ollama. The exact clock is retained.
                    value = {k: v for k, v in value.items() if k != 'query_time'} | (
                        {'query_time': value['query_time']} if 'query_time' in value else {})
                    item['content'] = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
            except (ValueError, TypeError):
                pass  # The separate repair feedback remains verbatim.
        result.append(item)
    return result
