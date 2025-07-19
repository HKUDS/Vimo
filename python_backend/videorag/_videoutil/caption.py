import os
import asyncio
import torch
import numpy as np
from PIL import Image
from tqdm import tqdm
from moviepy.video.io.VideoFileClip import VideoFileClip
from io import BytesIO
import base64
from openai import OpenAI, AsyncOpenAI
from .._utils import logger

def encode_pil_image(pil_image):
    buffer = BytesIO()
    pil_image.save(buffer, format='JPEG')
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")

def encode_video(video, frame_times):
    frames = []
    for t in frame_times:
        frames.append(video.get_frame(t))
    frames = np.stack(frames, axis=0)
    frames = [Image.fromarray(v.astype('uint8')).resize((1280, 720)) for v in frames]
    base64_images = []
    for frame in frames:
        base64_image = encode_pil_image(frame)
        base64_images.append(base64_image)
    return base64_images

async def _process_single_caption(caption_model_func, index, video_frames, segment_transcript, global_config):
    """Process a single video segment caption using LLM config's caption model function"""
    try:
        content = []
        query = f"The transcript of the current video:\n{segment_transcript}.\nNow provide a description (caption) of the video in English."
        for frame in video_frames:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame}"}})
        content.append({"type": "text", "text": query})
        
        segment_caption = await caption_model_func(content, global_config=global_config)
        result = segment_caption.replace("\n", "").replace("<|endoftext|>", "") if segment_caption else ""
        return index, result
    except Exception as e:
        logger.info(f"❌ Caption failed for segment {index}: {str(e)}")
        return index, ""

async def segment_caption_async(video_name, video_path, segment_index2name, transcripts, segment_times_info, global_config):
    """Async caption generation with concurrent processing"""
    caption_model_func = global_config["llm"]["caption_model_func"]
    
    logger.info(f"🎬 Extracting frames for {len(segment_index2name)} segments...")
    with VideoFileClip(video_path) as video:
        segment_data = {
            index: {
                'frames': encode_video(video, segment_times_info[index]["frame_times"]),
                'transcript': transcripts[index]
            }
            for index in segment_index2name
        }
    
    logger.info(f"🎨 Starting caption generation for {len(segment_index2name)} segments...")
    
    # Use asyncio.gather() - concurrent control is handled by limit_async_func_call wrapper
    results = await asyncio.gather(
        *[_process_single_caption(caption_model_func, index, 
                                 segment_data[index]['frames'], 
                                 segment_data[index]['transcript'], 
                                 global_config) 
          for index in segment_index2name]
    )
    
    caption_result = {index: caption for index, caption in results}
    logger.info(f"🎉 Caption generation completed! Generated {len(caption_result)} captions successfully.")
    return caption_result

def segment_caption(video_name, video_path, segment_index2name, transcripts, segment_times_info, caption_result, global_config):
    """Worker function for multiprocessing"""
    try:
        result = asyncio.run(
            segment_caption_async(video_name, video_path, segment_index2name, transcripts, segment_times_info, global_config)
        )
        for index, caption in result.items():
            caption_result[index] = caption
    except Exception as e:
        logger.error(f"Error in segment_caption:\n {str(e)}")
        raise RuntimeError

def merge_segment_information(segment_index2name, segment_times_info, transcripts, captions):
    inserting_segments = {}
    for index in segment_index2name:
        inserting_segments[index] = {"content": None, "time": None}
        segment_name = segment_index2name[index]
        inserting_segments[index]["time"] = '-'.join(segment_name.split('-')[-2:])
        inserting_segments[index]["content"] = f"Caption:\n{captions[index]}\nTranscript:\n{transcripts[index]}\n\n"
        inserting_segments[index]["transcript"] = transcripts[index]
        inserting_segments[index]["frame_times"] = segment_times_info[index]["frame_times"].tolist()
    return inserting_segments

async def _process_retrieved_segment_caption(caption_model_func, this_segment, refine_knowledge, video_path_db, video_segments, num_sampled_frames, global_config):
    """Process a single retrieved segment caption using LLM config's caption model function"""
    video_name = '_'.join(this_segment.split('_')[:-1])
    index = this_segment.split('_')[-1]
    segment_transcript = video_segments._data[video_name][index]["transcript"]
    
    try:
        video_path = video_path_db._data[video_name]
        timestamp = video_segments._data[video_name][index]["time"].split('-')
        start, end = eval(timestamp[0]), eval(timestamp[1])
        
        with VideoFileClip(video_path) as video:
            frame_times = np.linspace(start, end, num_sampled_frames, endpoint=False)
            video_frames = encode_video(video, frame_times)
        
        query = f"The transcript of the current video:\n{segment_transcript}.\nNow provide a very detailed description (caption) of the video in English and extract relevant information about: {refine_knowledge}'"
        
        content = []
        for frame in video_frames:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame}"}})
        content.append({"type": "text", "text": query})
        
        segment_caption = await caption_model_func(content, global_config=global_config)
        this_caption = segment_caption.replace("\n", "").replace("<|endoftext|>", "") if segment_caption else ""
        
        result = f"Caption:\n{this_caption}\nTranscript:\n{segment_transcript}\n\n"
        return this_segment, result
        
    except Exception as e:
        logger.info(f"❌ Retrieved caption failed for segment {this_segment}: {str(e)}")
        return this_segment, f"Caption:\nError generating caption\nTranscript:\n{segment_transcript}\n\n"

async def retrieved_segment_caption_async(refine_knowledge, retrieved_segments, video_path_db, video_segments, num_sampled_frames, global_config):
    """Async retrieved segment caption generation"""
    caption_model_func = global_config["llm"]["caption_model_func"]
    
    logger.info(f"🔍 Starting detailed caption for {len(retrieved_segments)} retrieved segments...")
    
    # Use asyncio.gather() - concurrent control is handled by limit_async_func_call wrapper
    results = await asyncio.gather(
        *[_process_retrieved_segment_caption(caption_model_func, this_segment, refine_knowledge,
                                           video_path_db, video_segments, num_sampled_frames, global_config) 
          for this_segment in retrieved_segments]
    )
    
    caption_result = {segment_id: caption for segment_id, caption in results}
    logger.info(f"🎉 Retrieved caption generation completed! Generated {len(caption_result)} captions successfully.")
    return caption_result
