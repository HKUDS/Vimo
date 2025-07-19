import os
import asyncio
from tqdm import tqdm
import dashscope
from dashscope.audio.asr import Recognition
from .._utils import logger

async def process_single_segment(semaphore, index, segment_name, audio_file, model, audio_output_format, sample_rate):
    """
    Process a single audio segment with ASR
    """
    async with semaphore:  # Limit concurrent requests
        try:
            logger.info(f"Processing segment {segment_name} with model {model}")
            # Create recognition instance
            recognition = Recognition(
                model=model,
                format=audio_output_format,
                sample_rate=sample_rate,
                language_hints=['zh', 'en', 'ja'],
                callback=None  # type: ignore  # SDK type annotation issue
            )
            
            # Call the API - Note: this might need to be wrapped in asyncio.to_thread for sync API
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, recognition.call, audio_file)
            
            # logger.info(f"ASR result: {result}")
            # Extract text from result
            if result and "output" in result and "sentence" in result["output"]:
                sentences = result["output"]["sentence"]
                asr_result = ""
                for sentence in sentences:
                    asr_result += sentence.get('text', '') + "\n"
                return index, asr_result.strip()
            else:
                logger.warning(f"No transcription result for segment {segment_name}")
                return index, ""
                
        except Exception as e:
            logger.error(f"ASR failed for segment {segment_name}: {str(e)}")
            raise e

async def speech_to_text_online(video_name, working_dir, segment_index2name, audio_output_format, global_config, max_concurrent=5):
    """
    Online ASR using Alibaba Cloud DashScope API with async concurrent processing
    """
    # Get API key and sample rate from global config
    api_key = global_config.get('ali_dashscope_api_key')
    sample_rate = global_config.get('audio_sample_rate', 16000)
    
    # Set the API key
    dashscope.api_key = api_key
    
    cache_path = os.path.join(working_dir, '_cache', video_name)
    
    # Create semaphore to limit concurrent requests
    semaphore = asyncio.Semaphore(max_concurrent)
    
    # Create tasks for all segments
    tasks = []
    for index in segment_index2name:
        segment_name = segment_index2name[index]
        audio_file = os.path.join(cache_path, f"{segment_name}.{audio_output_format}")
        
        task = process_single_segment(
            semaphore, index, segment_name, audio_file, 
            global_config.get('asr_model'), audio_output_format, sample_rate
        )
        tasks.append(task)
    
    # Execute all tasks concurrently with real-time progress
    total_tasks = len(tasks)
    logger.info(f"🎤 Starting ASR for {total_tasks} audio segments (max {max_concurrent} concurrent)...")
    
    transcripts = {}
    completed = 0
    
    # Use asyncio.as_completed for real-time progress updates
    for completed_task in asyncio.as_completed(tasks):
        try:
            result = await completed_task
            if isinstance(result, tuple) and len(result) == 2:
                index, text = result
                transcripts[index] = text
                completed += 1
                logger.info(f"✅ Completed {completed}/{total_tasks} segments (Progress: {completed/total_tasks*100:.1f}%)")
            else:
                # Handle unexpected result format
                completed += 1
                logger.info(f"⚠️  Unexpected result format for segment {completed}")
                
        except Exception as e:
            completed += 1
            logger.error(f"❌ Task failed: {e}")
            logger.info(f"❌ Failed {completed}/{total_tasks} segments (Progress: {completed/total_tasks*100:.1f}%)")
    
    logger.info(f"🎉 ASR processing completed! Processed {len(transcripts)} segments successfully.")
    
    return transcripts


async def speech_to_text_async(video_name, working_dir, segment_index2name, audio_output_format, global_config):
    """
    Async speech-to-text function using Alibaba Cloud DashScope online ASR
    
    Args:
        video_name: Name of the video
        working_dir: Working directory
        segment_index2name: Mapping of segment indices to names
        audio_output_format: Audio file format
        global_config: Global configuration dictionary containing API keys and settings
    """
    api_key = global_config.get('ali_dashscope_api_key')
    
    if not api_key:
        raise ValueError("ali_dashscope_api_key must be provided in global_config for online ASR")
    
    return await speech_to_text_online(
        video_name, working_dir, segment_index2name, audio_output_format, global_config
    )

def speech_to_text(video_name, working_dir, segment_index2name, audio_output_format, global_config):
    """
    Synchronous wrapper for async speech-to-text function
    
    Args:
        video_name: Name of the video
        working_dir: Working directory
        segment_index2name: Mapping of segment indices to names
        audio_output_format: Audio file format
        global_config: Global configuration dictionary containing API keys and settings
    """
    # Run the async function in an event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(
        speech_to_text_async(video_name, working_dir, segment_index2name, audio_output_format, global_config)
    )