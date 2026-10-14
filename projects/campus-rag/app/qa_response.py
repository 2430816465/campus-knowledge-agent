"""Structural contract only. Provenance and numerical checks remain separate."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

EvidenceId = Literal['E1','E2','E3','E4']


class Citation(BaseModel):
    # Legacy model quote fields are ignored; the server always copies originals.
    model_config = ConfigDict(strict=True, extra='ignore')
    id: EvidenceId


class Explanation(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')
    text: Annotated[str, Field(min_length=1,max_length=600)]
    ids: Annotated[list[EvidenceId], Field(min_length=1,max_length=4)]


class PublicAnswer(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')
    citations: Annotated[list[Citation], Field(max_length=8)]
    explanation: Annotated[list[Explanation], Field(max_length=4)]


RESPONSE_SCHEMA = PublicAnswer.model_json_schema()


def parse_response(content):
    if not isinstance(content,str) or len(content)>25600:
        raise ValueError('Model response exceeds structural budget')
    return PublicAnswer.model_validate_json(content).model_dump()
