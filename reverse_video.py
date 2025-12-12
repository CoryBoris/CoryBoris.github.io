from moviepy.editor import VideoFileClip
from moviepy.video.fx.time_mirror import time_mirror

# Load the video
clip = VideoFileClip("assets/Coat_Unfolding.mp4")

# Reverse it
reversed_clip = time_mirror(clip)

# Save with same quality settings
reversed_clip.write_videofile(
    "assets/Coat_Unfolding_Reverse.mp4",
    codec="libx264",
    audio=False,
    preset="medium",
    ffmpeg_params=["-crf", "18"]
)

clip.close()
reversed_clip.close()

print("Done! Saved to assets/Coat_Unfolding_Reverse.mp4")
