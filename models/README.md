# Speech Models

This directory holds offline speech recognition models for the Electron desktop app.
Model subdirectories are excluded from git (they are large binary files).

## Where models are loaded from

| Mode | Model path |
|---|---|
| Dev (`npm run electron:dev`) | `{project}/models/{lang}/` |
| Packaged app | `{userData}/models/{lang}/` |

The app's userData folder can be opened via **Help → Open App Data Folder**.

---

## English (en-US / en-GB)

**Recommended model:** `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` (~60 MB)

1. Download from:
   ```
   https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
   ```
   File: `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2`

2. Extract and place the contents in:
   ```
   models/
   └── en-US/
       ├── encoder-epoch-99-avg-1.int8.onnx
       ├── decoder-epoch-99-avg-1.int8.onnx
       ├── joiner-epoch-99-avg-1.int8.onnx
       └── tokens.txt
   ```
   For English (UK), create `models/en-GB/` with the same or a British-English model.

---

## French (fr-FR)

**Recommended model:** `sherpa-onnx-streaming-zipformer-fr-2023-04-14` (~200 MB)

1. Download from:
   ```
   https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
   ```
   File: `sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2`

2. Extract and place the contents in:
   ```
   models/
   └── fr-FR/
       ├── encoder-epoch-29-avg-9-with-averaged-model.int8.onnx
       ├── decoder-epoch-29-avg-9-with-averaged-model.int8.onnx
       ├── joiner-epoch-29-avg-9-with-averaged-model.int8.onnx
       └── tokens.txt
   ```

---

## Arabic (ar-MA / ar-SA / ar-EG)

All three Arabic dialects share the same model directory: `models/ar/`.

**Recommended model:** `sherpa-onnx-streaming-zipformer-ar-2023-02-25` (~200 MB)

1. Download from:
   ```
   https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
   ```
   Search for a file matching `sherpa-onnx-streaming-*-ar-*.tar.bz2`.
   If no streaming model is listed, look for MMS-based models:
   `sherpa-onnx-mms-300m-ar` (non-streaming; also supported by this app).

2. Extract and place the contents in:
   ```
   models/
   └── ar/
       ├── encoder-*.onnx   (or model.onnx for CTC/MMS models)
       ├── decoder-*.onnx
       ├── joiner-*.onnx
       └── tokens.txt
   ```

> **Note:** Because Arabic script is written right-to-left and dialect variation is high,
> recognition accuracy depends heavily on the model's training data.
> The app sends audio at 16 kHz mono; all sherpa-onnx models expect this format.

---

## Supported model architectures

| Type | Files required |
|---|---|
| Transducer (RNN-T) | `encoder-*.onnx`, `decoder-*.onnx`, `joiner-*.onnx`, `tokens.txt` |
| Zipformer2 CTC | single `*.onnx` (not named encoder/decoder/joiner), `tokens.txt` |

The app auto-detects which architecture is present in the directory.

---

## Directory layout reference

```
models/
├── en-US/          ← English (US)
├── en-GB/          ← English (UK) — optional, falls back to en-GB model
├── fr-FR/          ← French
└── ar/             ← Arabic (shared by ar-MA, ar-SA, ar-EG)
```

---

## Finding more models

Browse all available streaming models at:
```
https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
```
Look for files starting with `sherpa-onnx-streaming-*`.

Hugging Face mirror (faster downloads in some regions):
```
https://huggingface.co/csukuangfj
```
