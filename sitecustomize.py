print(">>> sitecustomize.py loaded")


import os
os.environ["CHROMA_NO_DEFAULT_EMBEDDINGS"] = "True"
