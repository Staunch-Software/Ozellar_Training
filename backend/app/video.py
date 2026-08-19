"""ffmpeg-based video compression for course-builder uploads.

Re-encodes to a much smaller H.264/AAC file (capped at 720p-wide, never
upscaled) so course videos take a fraction of the disk/blob space they did
uncompressed. If ffmpeg isn't installed, compression is skipped and the
original file is used untouched — an upload should never fail just because
compression isn't available.
"""
import os
import shutil
import subprocess

_FFMPEG_PATH = shutil.which("ffmpeg")
_warned_missing = False


def compress_video(input_path: str) -> str:
    """Return the path to a compressed copy of input_path, or input_path
    unchanged if ffmpeg is unavailable or compression fails."""
    global _warned_missing
    if not _FFMPEG_PATH:
        if not _warned_missing:
            print("[video] ffmpeg not found on PATH — skipping video compression.")
            _warned_missing = True
        return input_path

    output_path = input_path + ".compressed.mp4"
    cmd = [
        _FFMPEG_PATH, "-y", "-i", input_path,
        "-vf", "scale='min(1280,iw)':-2",
        "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"[video] ffmpeg compression failed, using original file: {e}")
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
        return input_path

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        return input_path

    try:
        before, after = os.path.getsize(input_path), os.path.getsize(output_path)
        print(f"[video] compressed {os.path.basename(input_path)}: {before} -> {after} bytes "
              f"({100 * (1 - after / before):.0f}% smaller)")
    except OSError:
        pass

    os.remove(input_path)
    return output_path
