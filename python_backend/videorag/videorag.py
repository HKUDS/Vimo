# type: ignore
import os
import shutil
import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Callable, Dict, List, Optional, Type, Union, cast
import tiktoken
import logging


from ._llm import (
    LLMConfig,
    openai_4o_mini_config,
)
from ._op import (
    chunking_by_video_segments,
    extract_entities,
    get_chunks,
    videorag_query,
    videorag_query_multiple_choice,
)
from ._storage import (
    JsonKVStorage,
    NanoVectorDBStorage,
    NanoVectorDBVideoSegmentStorage,
    NetworkXStorage,
)
from ._utils import (
    EmbeddingFunc,
    compute_mdhash_id,
    limit_async_func_call,
    wrap_embedding_func_with_attrs,
    convert_response_to_json,
    always_get_an_event_loop,
    logger,
    SerializableEmbeddingWrapper,
    SerializableLLMWrapper,
)
from .base import (
    BaseGraphStorage,
    BaseKVStorage,
    BaseVectorStorage,
    StorageNameSpace,
    QueryParam,
)
from ._videoutil import(
    split_video,
    speech_to_text,
    segment_caption,
    merge_segment_information,
    saving_video_segments,
)


@dataclass
class VideoRAG:
    working_dir: str = field(
        default_factory=lambda: f"./videorag_cache_{datetime.now().strftime('%Y-%m-%d-%H:%M:%S')}"
    )
    
    # video
    threads_for_split: int = 10
    video_segment_length: int = 30 # seconds
    rough_num_frames_per_segment: int = 5 # frames
    fine_num_frames_per_segment: int = 15 # frames
    video_output_format: str = "mp4"
    audio_output_format: str = "mp3"
    audio_sample_rate: int = 16000  # 16kHz
    video_embedding_batch_num: int = 2
    segment_retrieval_top_k: int = 4
    video_embedding_dim: int = 1024
    
    # query
    retrieval_topk_chunks: int = 2
    query_better_than_threshold: float = 0.2
    
    # graph mode
    enable_local: bool = True
    enable_naive_rag: bool = True

    # api key
    ali_dashscope_api_key: str = None
    ali_dashscope_base_url: str = None
    caption_model: str = None
    asr_model: str = None

    openai_api_key: str = None
    openai_base_url: str = None

    # text chunking
    chunk_func: Callable[
        [
            list[list[int]],
            List[str],
            tiktoken.Encoding,
            Optional[int],
        ],
        List[Dict[str, Union[str, int]]],
    ] = chunking_by_video_segments
    chunk_token_size: int = 1200
    # chunk_overlap_token_size: int = 100
    tiktoken_model_name: str = "gpt-4o"

    # entity extraction
    entity_extract_max_gleaning: int = 1
    entity_summary_to_max_tokens: int = 500

    # Change to your LLM provider
    llm: LLMConfig = field(default_factory=openai_4o_mini_config)
    
    # entity extraction
    entity_extraction_func: callable = extract_entities
    
    # storage
    key_string_value_json_storage_cls: Type[BaseKVStorage] = JsonKVStorage
    vector_db_storage_cls: Type[BaseVectorStorage] = NanoVectorDBStorage
    vs_vector_db_storage_cls: Type[BaseVectorStorage] = NanoVectorDBVideoSegmentStorage
    vector_db_storage_cls_kwargs: dict = field(default_factory=dict)
    graph_storage_cls: Type[BaseGraphStorage] = NetworkXStorage
    enable_llm_cache: bool = True

    # extension
    always_create_working_dir: bool = True
    addon_params: dict = field(default_factory=dict)
    convert_response_to_json_func: callable = convert_response_to_json
    
    # Shared ImageBind Client
    imagebind_client: object = None
    
    def __post_init__(self):
        # Configure logger to write to file
        log_file = os.path.join(self.working_dir, "log.txt")
        
        assert self.ali_dashscope_api_key is not None, "ali_dashscope_api_key is required"
        assert self.ali_dashscope_base_url is not None, "ali_dashscope_base_url is required"
        assert self.caption_model is not None, "caption_model is required"
        assert self.asr_model is not None, "asr_model is required"
        assert self.openai_api_key is not None, "openai_api_key is required"
        assert self.openai_base_url is not None, "openai_base_url is required"

        # Create working directory if it doesn't exist
        if not os.path.exists(self.working_dir) and self.always_create_working_dir:
            os.makedirs(self.working_dir)
        
        # Configure logger
        logger.setLevel(logging.INFO)
        
        # Remove existing handlers to avoid duplicate logs
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)
        
        # Create file handler
        file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        
        # Create formatter
        formatter = logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s')
        file_handler.setFormatter(formatter)
        
        # Add handler to logger
        logger.addHandler(file_handler)
        
        # Also keep console output (optional)
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        self.safe_config = {
            "working_dir": self.working_dir,
            "threads_for_split": self.threads_for_split,
            "video_segment_length": self.video_segment_length,
            "rough_num_frames_per_segment": self.rough_num_frames_per_segment,
            "fine_num_frames_per_segment": self.fine_num_frames_per_segment,
            "video_output_format": self.video_output_format,
            "audio_output_format": self.audio_output_format,
            "audio_sample_rate": self.audio_sample_rate,
            "video_embedding_batch_num": self.video_embedding_batch_num,
            "segment_retrieval_top_k": self.segment_retrieval_top_k,
            "video_embedding_dim": self.video_embedding_dim,
            "retrieval_topk_chunks": self.retrieval_topk_chunks,
            "query_better_than_threshold": self.query_better_than_threshold,
            "enable_local": self.enable_local,
            "enable_naive_rag": self.enable_naive_rag,
            "ali_dashscope_api_key": self.ali_dashscope_api_key,
            "ali_dashscope_base_url": self.ali_dashscope_base_url,
            "caption_model": self.caption_model,
            "asr_model": self.asr_model,
            "openai_api_key": self.openai_api_key,
            "openai_base_url": self.openai_base_url,
            "chunk_func": self.chunk_func,
            "chunk_token_size": self.chunk_token_size,
            "tiktoken_model_name": self.tiktoken_model_name,
            "entity_extract_max_gleaning": self.entity_extract_max_gleaning,
            "entity_summary_to_max_tokens": self.entity_summary_to_max_tokens,
            "llm": asdict(self.llm),
            "entity_extraction_func": self.entity_extraction_func,
            "key_string_value_json_storage_cls": self.key_string_value_json_storage_cls,
            "vector_db_storage_cls": self.vector_db_storage_cls,
            "vs_vector_db_storage_cls": self.vs_vector_db_storage_cls,
            "vector_db_storage_cls_kwargs": self.vector_db_storage_cls_kwargs,
            "graph_storage_cls": self.graph_storage_cls,
            "enable_llm_cache": self.enable_llm_cache,
            "always_create_working_dir": self.always_create_working_dir,
            "addon_params": self.addon_params,
            "convert_response_to_json_func": self.convert_response_to_json_func,

        }

        self.video_path_db = self.key_string_value_json_storage_cls(
            namespace="video_path", global_config=self.safe_config
        )
        self.safe_config["video_path_db"] = self.video_path_db

        self.video_segments = self.key_string_value_json_storage_cls(
            namespace="video_segments", global_config=self.safe_config
        )
        self.safe_config["video_segments"] = self.video_segments

        self.text_chunks = self.key_string_value_json_storage_cls(
            namespace="text_chunks", global_config=self.safe_config
        )
        self.safe_config["text_chunks"] = self.text_chunks

        self.llm_response_cache = (
            self.key_string_value_json_storage_cls(
                namespace="llm_response_cache", global_config=self.safe_config
            )
            if self.enable_llm_cache
            else None
        )
        self.safe_config["llm_response_cache"] = self.llm_response_cache

        self.chunk_entity_relation_graph = self.graph_storage_cls(
            namespace="chunk_entity_relation", global_config=self.safe_config
        )
        self.safe_config["chunk_entity_relation_graph"] = self.chunk_entity_relation_graph

        # Use serializable wrapper to avoid pickle errors
        wrapped_embedding_func = wrap_embedding_func_with_attrs(
                embedding_dim = self.llm.embedding_dim,
                max_token_size = self.llm.embedding_max_token_size,
                model_name = self.llm.embedding_model_name)(self.llm.embedding_func)
        limited_embedding_func = limit_async_func_call(self.llm.embedding_func_max_async)(wrapped_embedding_func)
        
        self.embedding_func = SerializableEmbeddingWrapper(limited_embedding_func, self.safe_config)
        self.embedding_func.embedding_dim = wrapped_embedding_func.embedding_dim
        self.embedding_func.max_token_size = wrapped_embedding_func.max_token_size
        self.embedding_func.model_name = wrapped_embedding_func.model_name
        self.safe_config["embedding_func"] = self.embedding_func

        self.entities_vdb = (
            self.vector_db_storage_cls(
                namespace="entities",
                global_config=self.safe_config,
                embedding_func=self.embedding_func,
                meta_fields={"entity_name"},
            )
            if self.enable_local
            else None
        )
        self.safe_config["entities_vdb"] = self.entities_vdb

        self.chunks_vdb = (
            self.vector_db_storage_cls(
                namespace="chunks",
                global_config=self.safe_config,
                embedding_func=self.embedding_func,
            )
            if self.enable_naive_rag
            else None
        )
        self.safe_config["chunks_vdb"] = self.chunks_vdb
        
        self.video_segment_feature_vdb = (
            self.vs_vector_db_storage_cls(
                namespace="video_segment_feature",
                global_config=self.safe_config,
                embedding_func=None,
                embedder_client=self.imagebind_client,
            )
        )
        self.safe_config["video_segment_feature_vdb"] = self.video_segment_feature_vdb
        
        # Use serializable wrapper to avoid pickle errors
        self.llm.best_model_func = limit_async_func_call(self.llm.best_model_max_async)(
            SerializableLLMWrapper(self.llm.best_model_func, self.safe_config, self.llm_response_cache)
        )
        self.llm.cheap_model_func = limit_async_func_call(self.llm.cheap_model_max_async)(
            SerializableLLMWrapper(self.llm.cheap_model_func, self.safe_config, self.llm_response_cache)
        )
        self.llm.caption_model_func = limit_async_func_call(self.llm.caption_model_max_async)(
            SerializableLLMWrapper(self.llm.caption_model_func, self.safe_config, self.llm_response_cache)
        )
        self.safe_config["llm"] = asdict(self.llm)

    def insert_video(self, video_path_list=None, progress_callback=None):
        """
        Insert videos and build index
        
        Args:
            video_path_list: 视频文件路径列表
            progress_callback: 进度回调函数，接收 (step_name, message) 参数
        """
        if video_path_list is None:
            video_path_list = []
            
        loop = always_get_an_event_loop()
        
        for video_path in video_path_list:
            # Step0: check the existence
            video_name = os.path.basename(video_path).split('.')[0]
            if video_name in self.video_segments._data:
                logger.info(f"Find the video named {os.path.basename(video_path)} in storage and skip it.")
                continue
            
            loop.run_until_complete(self.video_path_db.upsert(
                {video_name: video_path}
            ))
            
            # Step1: split the videos
            if progress_callback:
                progress_callback("Video Splitting", f"Splitting video into clips for {video_name}...")
            
            segment_index2name, segment_times_info = split_video(
                video_path, 
                self.working_dir, 
                self.video_segment_length,
                self.rough_num_frames_per_segment,
                self.audio_output_format,
                self.audio_sample_rate,  # Pass the sample rate
            )
            
            # Step2: obtain transcript with ASR (online)
            if progress_callback:
                progress_callback("Audio Processing", f"Performing speech recognition for {video_name}...")
            
            transcripts = speech_to_text(
                video_name, 
                self.working_dir, 
                segment_index2name,
                self.audio_output_format,
                self.safe_config,  # Pass global config dict
            )
            
            # Step3: saving video segments **as well as** obtain caption with vision language model
            if progress_callback:
                progress_callback("Visual Analyzing", f"Analyzing video content for {video_name}...")
            
    
            saving_video_segments(
                    video_name,
                    video_path,
                    self.working_dir,
                    segment_index2name,
                    segment_times_info,
                    self.video_output_format,
            )
            
            # Pass the complete safe_config to segment_caption for LLM configuration
            captions = {}
            segment_caption(
                    video_name,
                    video_path,
                    segment_index2name,
                    transcripts,
                    segment_times_info,
                    captions,
                    self.safe_config,
            )

            segments_information = merge_segment_information(
                segment_index2name,
                segment_times_info,
                transcripts,
                captions,
            )
            
            loop.run_until_complete(self.video_segments.upsert(
                {video_name: segments_information}
            ))
            
            # Step4: encode video segment features
            if progress_callback:
                progress_callback("Feature Encoding", f"Encoding video features for {video_name}...")
            
            loop.run_until_complete(self.video_segment_feature_vdb.upsert(
                video_name,
                segment_index2name,
                self.video_output_format,
            ))

            video_segment_cache_path = os.path.join(self.working_dir, '_cache', video_name)
            if os.path.exists(video_segment_cache_path):
                shutil.rmtree(video_segment_cache_path)
            
            # Step 5: saving current video information
            if progress_callback:
                progress_callback("Saving Video Information", f"Saving video information for {video_name}...")
            loop.run_until_complete(self._save_video_segments())

        if progress_callback:
            progress_callback("Creating Knowledge Graph", f"Creating knowledge graph for all videos...")
        # start graph-based indexing
        loop.run_until_complete(self.ainsert(self.video_segments._data))
        
        # 🔄 Progress: 完成
        if progress_callback:
            progress_callback("Completed", f"Video processing completed for all videos")

    def query(self, query: str, param: QueryParam = QueryParam()):
        loop = always_get_an_event_loop()
        return loop.run_until_complete(self.aquery(query, param))

    async def aquery(self, query: str, param: QueryParam = QueryParam()):
        if param.mode == "videorag":
            response = await videorag_query(
                query,
                self.entities_vdb,
                self.text_chunks,
                self.chunks_vdb,
                self.video_path_db,
                self.video_segments,
                self.video_segment_feature_vdb,
                self.chunk_entity_relation_graph,
                param,
                self.safe_config,
            )
        # NOTE: update here
        elif param.mode == "videorag_multiple_choice":
            response = await videorag_query_multiple_choice(
                query,
                self.entities_vdb,
                self.text_chunks,
                self.chunks_vdb,
                self.video_path_db,
                self.video_segments,
                self.video_segment_feature_vdb,
                self.chunk_entity_relation_graph,
                param,
                self.safe_config,
            )
        else:
            raise ValueError(f"Unknown mode {param.mode}")
        await self._query_done()
        return response

    async def ainsert(self, new_video_segment):
        await self._insert_start()
        try:
            # ---------- chunking
            inserting_chunks = get_chunks(
                new_videos=new_video_segment,
                chunk_func=self.chunk_func,
                max_token_size=self.chunk_token_size,
            )
            _add_chunk_keys = await self.text_chunks.filter_keys(
                list(inserting_chunks.keys())
            )
            inserting_chunks = {
                k: v for k, v in inserting_chunks.items() if k in _add_chunk_keys
            }
            if not len(inserting_chunks):
                logger.warning(f"All chunks are already in the storage")
                return
            logger.info(f"[New Chunks] inserting {len(inserting_chunks)} chunks")
            if self.enable_naive_rag:
                logger.info("Insert chunks for naive RAG")
                await self.chunks_vdb.upsert(inserting_chunks)

            # TODO: no incremental update for communities now, so just drop all
            # await self.community_reports.drop()

            # ---------- extract/summary entity and upsert to graph
            logger.info("[Entity Extraction]...")
            maybe_new_kg, _, _ = await self.entity_extraction_func(
                inserting_chunks,
                knowledge_graph_inst=self.chunk_entity_relation_graph,
                entity_vdb=self.entities_vdb,
                global_config=self.safe_config,
            )
            if maybe_new_kg is None:
                logger.warning("No new entities found")
                return
            self.chunk_entity_relation_graph = maybe_new_kg
            # ---------- commit upsertings and indexing
            await self.text_chunks.upsert(inserting_chunks)
        finally:
            await self._insert_done()

    async def _insert_start(self):
        tasks = []
        for storage_inst in [
            self.chunk_entity_relation_graph,
        ]:
            if storage_inst is None:
                continue
            tasks.append(cast(StorageNameSpace, storage_inst).index_start_callback())
        await asyncio.gather(*tasks)

    async def _save_video_segments(self):
        tasks = []
        for storage_inst in [
            self.video_segment_feature_vdb,
            self.video_segments,
            self.video_path_db,
        ]:
            if storage_inst is None:
                continue
            tasks.append(cast(StorageNameSpace, storage_inst).index_done_callback())
        await asyncio.gather(*tasks)
    
    async def _insert_done(self):
        tasks = []
        for storage_inst in [
            self.text_chunks,
            self.llm_response_cache,
            self.entities_vdb,
            self.chunks_vdb,
            self.chunk_entity_relation_graph,
            self.video_segment_feature_vdb,
            self.video_segments,
            self.video_path_db,
        ]:
            if storage_inst is None:
                continue
            tasks.append(cast(StorageNameSpace, storage_inst).index_done_callback())
        await asyncio.gather(*tasks)

    async def _query_done(self):
        tasks = []
        for storage_inst in [self.llm_response_cache]:
            if storage_inst is None:
                continue
            tasks.append(cast(StorageNameSpace, storage_inst).index_done_callback())
        await asyncio.gather(*tasks)
