
import os
import glob
from qtfaststart import processor

upload_dir = "uploads"
for root, _, files in os.walk(upload_dir):
    for f in files:
        if f.lower().endswith(".mp4"):
            path = os.path.join(root, f)
            print(f"Checking {path}")
            try:
                tmp_path = path + ".tmp.mp4"
                processor.process(path, tmp_path)
                os.replace(tmp_path, path)
                print(f"Fixed {path}")
            except Exception as e:
                print(f"Skipped {path}: {e}")
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

