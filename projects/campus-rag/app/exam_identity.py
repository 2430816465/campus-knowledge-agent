"""Identify explicitly named professional English exams without inferring CET."""
import re


def professional_exam(question):
    focus = question.split('；追问：')[-1]
    four = bool(re.search(r'英语专业四级|专业英语四级|专四|(?<![A-Za-z0-9])TEM\s*-?\s*4(?!\d)', focus, re.I))
    eight = bool(re.search(r'英语专业八级|专业英语八级|专八|(?<![A-Za-z0-9])TEM\s*-?\s*8(?!\d)', focus, re.I))
    if four and eight:
        return '英语专业四级和八级考试'
    if four:
        return '英语专业四级考试'
    if eight:
        return '英语专业八级考试'
    return None
