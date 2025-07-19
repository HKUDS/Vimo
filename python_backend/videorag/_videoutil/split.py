import os
import time
import shutil
import numpy as np
from tqdm import tqdm
from moviepy.video import fx as vfx
from moviepy.video.io.VideoFileClip import VideoFileClip
from .._utils import logger

def split_video(
    video_path,
    working_dir,
    segment_length,
    num_frames_per_segment,
    audio_output_format='mp3',
    audio_sample_rate=16000,  # Default 16kHz for speech recognition
):  
    unique_timestamp = str(int(time.time() * 1000))
    video_name = os.path.basename(video_path).split('.')[0]
    video_segment_cache_path = os.path.join(working_dir, '_cache', video_name)
    if os.path.exists(video_segment_cache_path):
        shutil.rmtree(video_segment_cache_path)
    os.makedirs(video_segment_cache_path, exist_ok=False)
    
    segment_index = 0
    segment_index2name, segment_times_info = {}, {}
    with VideoFileClip(video_path) as video:
    
        total_video_length = int(video.duration)
        start_times = list(range(0, total_video_length, segment_length))
        # if the last segment is shorter than 5 seconds, we merged it to the last segment
        if len(start_times) > 1 and (total_video_length - start_times[-1]) < 5:
            start_times = start_times[:-1]
        
        for start in tqdm(start_times, desc=f"Spliting Video {video_name}"):
            if start != start_times[-1]:
                end = min(start + segment_length, total_video_length)
            else:
                end = total_video_length
            
            subvideo = video.subclip(start, end)
            subvideo_length = subvideo.duration
            frame_times = np.linspace(0, subvideo_length, num_frames_per_segment, endpoint=False)
            frame_times += start
            
            segment_index2name[f"{segment_index}"] = f"{unique_timestamp}-{segment_index}-{start}-{end}"
            segment_times_info[f"{segment_index}"] = {"frame_times": frame_times, "timestamp": (start, end)}
            
            # save audio
            audio_file_base_name = segment_index2name[f"{segment_index}"]
            audio_file = f'{audio_file_base_name}.{audio_output_format}'
            subaudio = subvideo.audio
            # Convert to mono and set sample rate using ffmpeg parameters
            subaudio.write_audiofile(
                os.path.join(video_segment_cache_path, audio_file), 
                codec='mp3',
                fps=audio_sample_rate,  # Set sample rate
                ffmpeg_params=['-ac', '1'],  # Force mono (1 audio channel)
                verbose=False, 
                logger=None
            )
            
            segment_index += 1

    return segment_index2name, segment_times_info

def saving_video_segments(
    video_name,
    video_path,
    working_dir,
    segment_index2name,
    segment_times_info,
    video_output_format='mp4',
):
    try:
        with VideoFileClip(video_path) as video:
            video_segment_cache_path = os.path.join(working_dir, '_cache', video_name)
            for index in tqdm(segment_index2name, desc=f"Saving Video Segments {video_name}"):
                start, end = segment_times_info[index]["timestamp"][0], segment_times_info[index]["timestamp"][1]
                video_file = f'{segment_index2name[index]}.{video_output_format}'
                subvideo = video.subclip(start, end)
                subvideo.write_videofile(os.path.join(video_segment_cache_path, video_file), codec='libx264', verbose=False, logger=None)
    except Exception as e:
        logger.error(f"Error in saving_video_segments:\n {str(e)}")
        raise RuntimeError