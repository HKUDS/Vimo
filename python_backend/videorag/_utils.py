import asyncio
import html
import json
import logging
import os
import re
import numbers
from dataclasses import dataclass
from functools import wraps
from hashlib import md5
from typing import Any, Union

import numpy as np
import tiktoken
import torch

logger = logging.getLogger("nano-graphrag")
ENCODER = None


def always_get_an_event_loop() -> asyncio.AbstractEventLoop:
    try:
        # If there is already an event loop, use it.
        loop = asyncio.get_event_loop()
    except RuntimeError:
        # If in a sub-thread, create a new event loop.
        logger.info("Creating a new event loop in a sub-thread.")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


def locate_json_string_body_from_string(content: str) -> Union[str, None]:
    """Locate the JSON string body from a string"""
    maybe_json_str = re.search(r"{.*}", content, re.DOTALL)
    if maybe_json_str is not None:
        return maybe_json_str.group(0)
    else:
        return None


def convert_response_to_json(response: str) -> dict:
    json_str = locate_json_string_body_from_string(response)
    assert json_str is not None, f"Unable to parse JSON from response: {response}"
    try:
        data = json.loads(json_str)
        return data
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {json_str}")
        raise e from None


def encode_string_by_tiktoken(content: str, model_name: str = "gpt-4o"):
    global ENCODER
    if ENCODER is None:
        ENCODER = tiktoken.encoding_for_model(model_name)
    tokens = ENCODER.encode(content)
    return tokens


def decode_tokens_by_tiktoken(tokens: list[int], model_name: str = "gpt-4o"):
    global ENCODER
    if ENCODER is None:
        ENCODER = tiktoken.encoding_for_model(model_name)
    content = ENCODER.decode(tokens)
    return content


def truncate_list_by_token_size(list_data: list, key: callable, max_token_size: int):
    """Truncate a list of data by token size"""
    if max_token_size <= 0:
        return []
    tokens = 0
    for i, data in enumerate(list_data):
        tokens += len(encode_string_by_tiktoken(key(data)))
        if tokens > max_token_size:
            return list_data[:i]
    return list_data


def compute_mdhash_id(content, prefix: str = ""):
    return prefix + md5(content.encode()).hexdigest()


def write_json(json_obj, file_name):
    with open(file_name, "w", encoding="utf-8") as f:
        json.dump(json_obj, f, indent=2, ensure_ascii=False)


def load_json(file_name):
    if not os.path.exists(file_name):
        return None
    with open(file_name, encoding="utf-8") as f:
        return json.load(f)


# it's dirty to type, so it's a good way to have fun
def pack_user_ass_to_openai_messages(*args: str):
    roles = ["user", "assistant"]
    return [
        {"role": roles[i % 2], "content": content} for i, content in enumerate(args)
    ]


def is_float_regex(value):
    return bool(re.match(r"^[-+]?[0-9]*\.?[0-9]+$", value))


def compute_args_hash(*args):
    return md5(str(args).encode()).hexdigest()


def split_string_by_multi_markers(content: str, markers: list[str]) -> list[str]:
    """Split a string by multiple markers"""
    if not markers:
        return [content]
    results = re.split("|".join(re.escape(marker) for marker in markers), content)
    return [r.strip() for r in results if r.strip()]


def enclose_string_with_quotes(content: Any) -> str:
    """Enclose a string with quotes"""
    if isinstance(content, numbers.Number):
        return str(content)
    content = str(content)
    content = content.strip().strip("'").strip('"')
    return f'"{content}"'


def list_of_list_to_csv(data: list[list]):
    return "\n".join(
        [
            ",\t".join([f"{enclose_string_with_quotes(data_dd)}" for data_dd in data_d])
            for data_d in data
        ]
    )


# -----------------------------------------------------------------------------------
# Refer the utils functions of the official GraphRAG implementation:
# https://github.com/microsoft/graphrag
def clean_str(input: Any) -> str:
    """Clean an input string by removing HTML escapes, control characters, and other unwanted characters."""
    # If we get non-string input, just give it back
    if not isinstance(input, str):
        return input

    result = html.unescape(input.strip())
    # https://stackoverflow.com/questions/4324790/removing-control-characters-from-a-string-in-python
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", "", result)


# Utils types -----------------------------------------------------------------------
@dataclass
class EmbeddingFunc:
    embedding_dim: int
    max_token_size: int
    model_name: str
    func: callable

    async def __call__(self, *args, **kwargs) -> np.ndarray:
        # Had to fix this as the embedding function took only one named argument put it's passed in
        # positionally, now we need to pass both
        kwargs['model_name'] = self.model_name
        
        # If there are positional arguments, convert them to keyword arguments
        if args:
            # Assuming the first positional argument is always 'texts'
            if len(args) == 1 and isinstance(args[0], list):
                kwargs['texts'] = args[0]
            else:
                raise ValueError("Unexpected positional arguments. Expected a single list of texts")
        # Call the function with the updated keyword arguments
        return await self.func(**kwargs)        


# Decorators ------------------------------------------------------------------------
def limit_async_func_call(max_size: int, waitting_time: float = 0.0001):
    """Add restriction of maximum async calling times for a async func"""

    def final_decro(func):
        """Not using async.Semaphore to aovid use nest-asyncio"""
        __current_size = 0

        @wraps(func)
        async def wait_func(*args, **kwargs):
            nonlocal __current_size
            while __current_size >= max_size:
                await asyncio.sleep(waitting_time)
            __current_size += 1
            result = await func(*args, **kwargs)
            __current_size -= 1
            return result

        return wait_func

    return final_decro


def wrap_embedding_func_with_attrs(**kwargs):
    """Wrap a function with attributes"""

    def final_decro(func) -> EmbeddingFunc:
        new_func = EmbeddingFunc(**kwargs, func=func)
        return new_func

    return final_decro


def get_best_device():
    """
    Get the best available device
    Priority: CUDA > MPS (Mac) > CPU
    """
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")


def get_imagebind_device():
    """
    Get the best device for ImageBind models
    ImageBind uses Conv3D which is not supported on MPS, so fall back to CPU on Mac
    Priority: CUDA > CPU (MPS not supported)
    """
    if torch.cuda.is_available():
        return torch.device("cuda")
    else:
        # Force CPU even if MPS is available because ImageBind uses Conv3D
        return torch.device("cpu")


class SerializableEmbeddingWrapper:
    """
    Serializable embedding function wrapper
    Solve pickle issues in multiprocessing
    """
    def __init__(self, embedding_func, global_config):
        self.embedding_func = embedding_func
        self.global_config = global_config
        
        # Copy attributes from EmbeddingFunc if available
        if hasattr(embedding_func, 'embedding_dim'):
            self.embedding_dim = embedding_func.embedding_dim
        if hasattr(embedding_func, 'max_token_size'):
            self.max_token_size = embedding_func.max_token_size
        if hasattr(embedding_func, 'model_name'):
            self.model_name = embedding_func.model_name
    
    async def __call__(self, *args, **kwargs):
        # Automatically add global_config
        kwargs['global_config'] = self.global_config
        return await self.embedding_func(*args, **kwargs)


class SerializableLLMWrapper:
    """
    Serializable LLM function wrapper
    Solve pickle issues in multiprocessing
    """
    def __init__(self, llm_func, global_config, hashing_kv=None):
        self.llm_func = llm_func
        self.global_config = global_config
        self.hashing_kv = hashing_kv
    
    async def __call__(self, *args, **kwargs):
        # Automatically add global_config and hashing_kv
        kwargs['global_config'] = self.global_config
        if self.hashing_kv is not None:
            kwargs['hashing_kv'] = self.hashing_kv
        return await self.llm_func(*args, **kwargs)
