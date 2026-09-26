#!/bin/sh
# Convert AmirMohseni/whisper-small-persian to CTranslate2 int8.
# Run after D:\afrakala-stt\models\_src\whisper-small-persian exists.
set -eu
if [ -f /models/whisper-small-persian-ct2/model.bin ]; then
  echo "CT2_ALREADY_THERE"
  exit 0
fi
pip install --no-cache-dir "ctranslate2>=4.4.0" "transformers>=4.41" "torch" sentencepiece
ct2-transformers-converter \
  --model /models/_src/whisper-small-persian \
  --output_dir /models/whisper-small-persian-ct2 \
  --copy_files tokenizer.json preprocessor_config.json \
  --quantization int8
echo "CT2_OK"
