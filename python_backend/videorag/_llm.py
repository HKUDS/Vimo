# type: ignore
import numpy as np
from openai import AsyncOpenAI, AsyncAzureOpenAI, APIConnectionError, RateLimitError
from dataclasses import asdict, dataclass, field

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import os

from ._utils import compute_args_hash, wrap_embedding_func_with_attrs
from .base import BaseKVStorage
from ._utils import EmbeddingFunc

global_openai_async_client = None
global_dashscope_async_client = None

def get_openai_async_client_instance(global_config):
    global global_openai_async_client
    if global_openai_async_client is None:
        global_openai_async_client = AsyncOpenAI(
            api_key=global_config["openai_api_key"],
            base_url=global_config["openai_base_url"],
        )
    return global_openai_async_client

def get_dashscope_async_client_instance(global_config):
    global global_dashscope_async_client
    if global_dashscope_async_client is None:
        global_dashscope_async_client = AsyncOpenAI(
            api_key=global_config["ali_dashscope_api_key"],
            base_url=global_config["ali_dashscope_base_url"],
        )
    return global_dashscope_async_client

# Setup LLM Configuration.
@dataclass
class LLMConfig:
    # To be set
    embedding_func_raw: callable
    embedding_model_name: str
    embedding_dim: int
    embedding_max_token_size: int
    embedding_batch_num: int    
    embedding_func_max_async: int 
    query_better_than_threshold: float
    
    best_model_func_raw: callable
    best_model_name: str    
    best_model_max_token_size: int
    best_model_max_async: int
    
    cheap_model_func_raw: callable
    cheap_model_name: str
    cheap_model_max_token_size: int
    cheap_model_max_async: int
    
    # Caption model configuration
    caption_model_func_raw: callable
    caption_model_name: str
    caption_model_max_async: int

    # Assigned in post init
    embedding_func: EmbeddingFunc  = None    
    best_model_func: callable = None    
    cheap_model_func: callable = None
    caption_model_func: callable = None
    

    def __post_init__(self):
        embedding_wrapper = wrap_embedding_func_with_attrs(
            embedding_dim = self.embedding_dim,
            max_token_size = self.embedding_max_token_size,
            model_name = self.embedding_model_name)
        self.embedding_func = embedding_wrapper(self.embedding_func_raw)

        self.best_model_func = lambda prompt, *args, **kwargs: self.best_model_func_raw(
            self.best_model_name, prompt, *args, **kwargs
        )

        self.cheap_model_func = lambda prompt, *args, **kwargs: self.cheap_model_func_raw(
            self.cheap_model_name, prompt, *args, **kwargs
        )
        
        self.caption_model_func = lambda content_list, *args, **kwargs: self.caption_model_func_raw(
            self.caption_model_name, content_list, *args, **kwargs
        )

##### OpenAI Configuration
@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
)
async def openai_complete_if_cache(
    model, prompt, system_prompt=None, history_messages=[], **kwargs
) -> str:
    openai_async_client = get_openai_async_client_instance(kwargs["global_config"])
    hashing_kv: BaseKVStorage = kwargs.pop("hashing_kv", None)
    # Remove global_config from kwargs as it's not needed for OpenAI API call
    kwargs.pop("global_config", None)
    
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.extend(history_messages)
    messages.append({"role": "user", "content": prompt})
    if hashing_kv is not None:
        args_hash = compute_args_hash(model, messages)
        if_cache_return = await hashing_kv.get_by_id(args_hash)
        # NOTE: I update here to avoid the if_cache_return["return"] is None
        if if_cache_return is not None and if_cache_return["return"] is not None:
            return if_cache_return["return"]

    response = await openai_async_client.chat.completions.create(
        model=model, messages=messages, **kwargs
    )

    if hashing_kv is not None:
        await hashing_kv.upsert(
            {args_hash: {"return": response.choices[0].message.content, "model": model}}
        )
        await hashing_kv.index_done_callback()
    return response.choices[0].message.content

async def gpt_complete(
        model_name, prompt, system_prompt=None, history_messages=[], **kwargs
) -> str:
    return await openai_complete_if_cache(
        model_name,
        prompt,
        system_prompt=system_prompt,
        history_messages=history_messages,
        **kwargs,
    )

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
)
async def openai_embedding(model_name: str, texts: list[str], **kwargs) -> np.ndarray:
    openai_async_client = get_openai_async_client_instance(kwargs["global_config"])
    # Remove global_config from kwargs as it's not needed for OpenAI API call
    kwargs.pop("global_config", None)
    
    response = await openai_async_client.embeddings.create(
        model=model_name, input=texts, encoding_format="float", **kwargs
    )
    return np.array([dp.embedding for dp in response.data])

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
)
async def dashscope_caption_complete(
    model_name, content_list, **kwargs
) -> str:
    """
    DashScope vision model completion for video caption
    content_list: list of {"type": "image_url", "image_url": {"url": "..."}} and {"type": "text", "text": "..."}
    """
    dashscope_async_client = get_dashscope_async_client_instance(kwargs["global_config"])
    
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": content_list}
    ]
    
    response = await dashscope_async_client.chat.completions.create(
        model=model_name, 
        messages=messages, 
    )
    
    return response.choices[0].message.content

openai_4o_mini_config = LLMConfig(
    embedding_func_raw = openai_embedding,
    embedding_model_name = "text-embedding-3-small",
    embedding_dim = 1536,
    embedding_max_token_size  = 8192,
    embedding_batch_num = 32,
    embedding_func_max_async = 16,
    query_better_than_threshold = 0.2,

    # LLM        
    best_model_func_raw = gpt_complete,
    best_model_name = "gpt-4o-mini",
    best_model_max_token_size = 32768,
    best_model_max_async = 16,
        
    cheap_model_func_raw = gpt_complete,
    cheap_model_name = "gpt-4o-mini",
    cheap_model_max_token_size = 32768,
    cheap_model_max_async = 16,
    
    # Caption model
    caption_model_func_raw = dashscope_caption_complete,
    caption_model_name = "qwen-vl-plus-latest",
    caption_model_max_async = 3
)