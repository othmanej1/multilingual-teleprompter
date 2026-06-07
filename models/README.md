# Speech Models

This directory holds offline speech recognition models for the Electron desktop app.
Model subdirectories are excluded from git (they are large binary files).

## Where models are loaded from

| Mode | Model path |
|---|---|
| Dev (`npm run electron:dev`) | `{project}/models/{lang}/` |
| Packaged app | `{userData}/models/{lang}/` |

The app's userData folder can be opened via **Help → Open App Data Folder**.

## Quick setup — English (recommended)

1. Download the small English streaming model (~60 MB):
   ```
   https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
   ```
   File: `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2`

2. Extract and rename the directory:
   ```
   models/
   └── en-US/
       ├── encoder-epoch-99-avg-1.int8.onnx
       ├── decoder-epoch-99-avg-1.int8.onnx
       ├── joiner-epoch-99-avg-1.int8.onnx
       └── tokens.txt
   ```
   (Paste the extracted `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/` contents directly into `models/en-US/`.)

3. Restart the app. Click **🎙 Start Listening** in the Voice Tracking panel.

## Supported model architectures

| Type | Files required |
|---|---|
| Transducer (RNN-T) | `encoder-*.onnx`, `decoder-*.onnx`, `joiner-*.onnx`, `tokens.txt` |
| Zipformer2 CTC | `model.onnx` (single file), `tokens.txt` |

## Other languages

Create a subdirectory matching the language code used in the app's language selector:

| Language selector | Model subdirectory |
|---|---|
| English (US) | `models/en-US/` |
| English (UK) | `models/en-GB/` |
| French        | `models/fr-FR/` |
| Arabic (Morocco) | `models/ar-MA/` |

Browse available streaming models at:
`https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models`

Look for files starting with `sherpa-onnx-streaming-*`.

## Production / packaged app

When running from the installed app, the model path is inside your user data directory.
Open **Help → Open App Data Folder** to navigate there, then create the `models/{lang}/` subfolder.
