---
name: kie-ai
description: >-
  Generate media (images, video, music, speech, sound effects, lip-sync, upscaling)
  with AI through the Kie.ai `kie-cli` command. Use this whenever the user wants to
  create or edit an image, generate a video, compose music, synthesize a voice/TTS,
  make a talking-avatar or lip-sync clip, upscale an image, or remove a background,
  and whenever they mention Kie.ai, Nano Banana, Veo3, Suno, ElevenLabs, Seedance,
  Seedream, Midjourney, Flux, Kling, Wan, Hailuo, GPT Image, Recraft, Ideogram, or
  Topaz. Trigger even if the user doesn't name a model, e.g. "make me an image of...",
  "turn this photo into a video", "generate a 30s song", "read this text aloud". If
  the `kie-cli` command isn't installed, this skill explains how to install it.
---

# Kie.ai media generation (kie-cli) — dobexx Fork

This skill uses the **dobexx fork** of `kie-cli-mcp` with additional features:
- **Seedance 2.5** (up to 30s duration, extended multimodal references)
- **Grok Imagine Image 2.0** (image-to-image mode)
- **File Upload Tools** (`upload_file`, `get_upload_url`, `upload_widget`)

## Step 0: Check the CLI is available

```bash
command -v kie-cli >/dev/null && kie-cli --help >/dev/null 2>&1 && echo "kie-cli ready" || echo "kie-cli missing"
```

- If ready, go to **Workflow**.
- If missing, go to **Install**.

Also confirm the API key is set:

```bash
[ -n "$KIE_AI_API_KEY" ] && echo "key set" || echo "KIE_AI_API_KEY not set"
```

## Install (only if the CLI is missing)

**Option A, from npm (preferred if published):**

```bash
npm i -g @felores/kie-cli && kie-cli --help | head -1
```

> ⚠️ **Note:** The npm package may not include the dobexx fork features.
> If you need Seedance 2.5, Grok Image 2.0, or Upload Tools, use Option B.

**Option B, from the dobexx fork (recommended):**

```bash
REPO="$HOME/Documents/GitHub/kie-cli-mcp"
[ -d "$REPO" ] || git clone https://github.com/dobexx/kie-cli-mcp "$REPO"
cd "$REPO"
npm install
npm run build -w @felores/kie-ai-core && npm run bundle -w @felores/kie-cli
chmod +x packages/cli/dist/index.js
ln -sf "$PWD/packages/cli/dist/index.js" "$(npm config get prefix)/bin/kie-cli"
kie-cli --help | head -1
```

(The bundle inlines everything except `sqlite3`, so the linked `kie-cli` runs
standalone. To remove it later: `rm "$(npm config get prefix)/bin/kie-cli"`.)

Then set the API key (get one at https://kie.ai):

```bash
export KIE_AI_API_KEY="your-key"
```

To persist it, add that line to `~/.zshrc` (or `~/.bashrc`). Optional env vars:
`KIE_AI_BASE_URL`, `KIE_AI_TIMEOUT`, `KIE_AI_DB_PATH`, `KIE_AI_CALLBACK_URL`.

If `npm i -g` fails with permissions, prefer fixing the npm prefix or using a node
version manager rather than `sudo`.

### Alternative: MCP Server (no CLI needed)

The same tools are also available through the MCP server at:
**https://kie-ai-mcp.fcjb8a.easypanel.host/mcp**

Add to your MCP client config:

```json
{
  "mcpServers": {
    "kie-ai": {
      "url": "https://kie-ai-mcp.fcjb8a.easypanel.host/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## Workflow

The flow is always: **discover → generate → poll → read result.** Generation is
asynchronous: a generate command returns a `task_id`, and you poll until it finishes.

### 1. Discover the right command and its flags

```bash
kie-cli --help                 # all commands, grouped [image]/[video]/[audio]/[utility]
kie-cli <tool> --help          # that tool's flags, with types, choices, and defaults
```

Read `<tool> --help` before composing a command. The flags, allowed enum values, and
defaults come straight from the tool's schema — this is the source of truth.

### 2. Run the generation with `--json`

Always pass `--json` so the output is machine-readable and you can extract the task id
reliably (e.g. with `jq`). Without `--json` the output is pretty-printed for humans.

### 3. Poll the task until it completes

```bash
kie-cli get_task_status --task_id <id> --json
```

Re-run until the status indicates completion (or failure). When complete, the JSON
holds the output URL(s). `get_task_status` also returns polling guidance based on
the media type; images finish in seconds, videos can take minutes. Don't poll in a
tight loop — wait a few seconds between checks.

### 4. List recent work

```bash
kie-cli list_tasks --json      # recent task ids + statuses (shared local task DB)
```

## New Features in dobexx Fork

### Seedance 2.5 (Extended Video Generation)

Generate longer videos with more reference inputs:

```bash
kie-cli bytedance_seedance_video --help

# Text-to-video with 2.5 mode (up to 30s)
kie-cli bytedance_seedance_video \
  --mode "2.5" \
  --prompt "cinematic drone shot over mountains at sunset" \
  --duration 25 \
  --json

# Multimodal reference (up to 30 images / 10 videos / 10 audios)
kie-cli bytedance_seedance_video \
  --mode "2.5" \
  --prompt "animate this scene" \
  --reference_image_urls "url1" "url2" "url3" \
  --duration 20 \
  --json
```

**Key differences in 2.5 mode:**
- Duration: up to **30 seconds** (vs. 15s in 2.0)
- References: up to **30 images / 10 videos / 10 audios** (vs. 9/3/3 in 2.0)
- Model ID: `bytedance/seedance-2-5`

### Video Continuation (Video fortsetzen)

Extend a previously generated video with Seedance. Three methods:

**Method 1: Task Reference (recommended for Kie.ai-generated videos)**
```bash
# Use the task_id from a previous Seedance generation
kie-cli bytedance_seedance_video \
  --prompt "continue the scene, the character walks forward" \
  --aspect_ratio adaptive \
  --extension_task_id "previous-task-id-here" \
  --duration 10 \
  --json
```

**Method 2: Reference Video (for external videos)**
```bash
# Provide the video URL directly
kie-cli bytedance_seedance_video \
  --prompt "continue this video" \
  --reference_video_urls "https://example.com/previous-video.mp4" \
  --duration 10 \
  --json
```

**Method 3: Last Frame (most precise control)**
```bash
# Extract the last frame from a video and use it as first_frame_url
kie-cli bytedance_seedance_video \
  --prompt "continue from this exact frame" \
  --first_frame_url "https://example.com/last-frame.jpg" \
  --duration 10 \
  --json
```

**Important:** `--aspect_ratio adaptive` is **required** for Method 1 (extension_task_id). It inherits the aspect ratio from the source video. For Methods 2 and 3, you can also use explicit ratios like `16:9`.

### Grok Imagine Image 2.0 (Image-to-Image)

Transform existing images with Grok Imagine:

```bash
kie-cli grok_imagine --help

# Text-to-image (original mode)
kie-cli grok_imagine \
  --generation_mode "text-to-image" \
  --prompt "a cyberpunk city at night" \
  --json

# Image-to-image (new mode) — auto-detected when image_urls + prompt are provided
kie-cli grok_imagine \
  --generation_mode "image-to-image" \
  --prompt "make it look like a watercolor painting" \
  --image_urls "https://example.com/photo.jpg" \
  --json
```

**Auto-detection:** If you provide both `--image_urls` and `--prompt`, the tool
automatically uses image-to-image mode.

### File Upload Tools

Upload files to Kie.ai and get public URLs for use in other tools. Three methods:

**Method 1: Local file (CLI only, recommended for large files)**
```bash
# Upload directly from disk — no base64 encoding needed
kie-cli upload_file \
  --file_path ./my-image.png \
  --filename "reference.jpg" \
  --json
```

**Method 2: Base64 from stdin (for pipes and large files)**
```bash
# Pipe base64 content via stdin (use --file_base64=- with equals sign)
cat image.png | base64 | kie-cli upload_file \
  --file_base64=- \
  --filename "reference.jpg" \
  --json

# Or from a file
base64 image.png | kie-cli upload_file --file_base64=- --filename "ref.jpg" --json
```

**Method 3: Base64 string (small files only, <100 KB)**
```bash
# Direct base64 string — works for small images only
kie-cli upload_file \
  --file_base64 "iVBORw0KGgo..." \
  --filename "reference.jpg" \
  --json
```

**Method 4: Remote URL (server fetches it)**
```bash
kie-cli upload_file \
  --file_url "https://example.com/image.png" \
  --filename "reference.png" \
  --auth_header "Bearer token-if-needed" \
  --json
```

**Presigned URL for browser-based upload:**
```bash
kie-cli get_upload_url \
  --filename "video.mp4" \
  --content_type "video/mp4" \
  --json
# Returns: { "upload_url": "...", "file_url": "..." }
# Client PUTs raw bytes to upload_url, then uses file_url in other tools
```

**Important limitations:**
- `--file_path` only works in the CLI, not via MCP server
- `--file_base64` as direct argument fails for files >~100 KB (command-line length limit) — use stdin (`--file_base64=-`) or `--file_path` instead
- `get_upload_url` requires the MCP server to be reachable (uses MCP_PUBLIC_URL)


**Common use case:** You have a local image that needs to be a public URL for
`reference_image_urls` in Seedance or other tools.

```bash
# 1. Upload the file
UPLOAD_RESULT=$(kie-cli upload_file --file_url "file:///path/to/image.jpg" --filename "ref.jpg" --json)
FILE_URL=$(echo "$UPLOAD_RESULT" | jq -r '.file_url')

# 2. Use in generation
kie-cli bytedance_seedance_video \
  --mode "2.5" \
  --prompt "animate this" \
  --reference_image_urls "$FILE_URL" \
  --json
```

### Upload Widget (Browser-based)

For MCP clients that support it, the `upload_widget` tool opens a browser-based
upload interface. If your client doesn't support MCP Apps (SEP-1865), it returns
a fallback link you can open manually.

**Note:** This tool is primarily for MCP server use, not CLI.

## Worked Examples

**Image (Nano Banana):**
```bash
kie-cli nano_banana_image --help
kie-cli nano_banana_image --prompt "a red panda coding at night, neon" --resolution 2K --json
# -> {"success": true, ... "task_id": "abc123" ...}
kie-cli get_task_status --task_id abc123 --json
```

**Video (Veo3), extracting the id with jq:**
```bash
ID=$(kie-cli veo3_generate_video --prompt "drone shot over a canyon at sunrise" --json | jq -r '.task_id // .response.data.taskId')
kie-cli get_task_status --task_id "$ID" --json
```

**Speech (ElevenLabs TTS):**
```bash
kie-cli elevenlabs_tts --help
kie-cli elevenlabs_tts --text "Welcome to the demo." --json
```

**Seedance 2.5 with multiple references:**
```bash
# Upload reference images first
IMG1=$(kie-cli upload_file --file_url "https://example.com/img1.jpg" --filename "ref1.jpg" --json | jq -r '.file_url')
IMG2=$(kie-cli upload_file --file_url "https://example.com/img2.jpg" --filename "ref2.jpg" --json | jq -r '.file_url')

# Generate with references
kie-cli bytedance_seedance_video \
  --mode "2.5" \
  --prompt "smooth transition between these scenes" \
  --reference_image_urls "$IMG1" "$IMG2" \
  --duration 15 \
  --json
```

**Grok Image 2.0 style transfer:**
```bash
# Upload source image
SOURCE=$(kie-cli upload_file --file_url "https://example.com/photo.jpg" --filename "photo.jpg" --json | jq -r '.file_url')

# Transform style
kie-cli grok_imagine \
  --generation_mode "image-to-image" \
  --prompt "in the style of Van Gogh's Starry Night" \
  --image_urls "$SOURCE" \
  --json
```

## Notes for reliable use

- **`--json` for anything programmatic.** Parse it; don't scrape the pretty output.
- **Errors are data, not crashes.** A bad/missing parameter returns
  `{"success": false, "error": ..., "parameter_guidance": ...}` and a non-zero exit
  code. Read `parameter_guidance` and fix the flags, then retry.
- **Invalid enum values are rejected by the CLI** with the list of valid choices.
  If you hit that, re-check `<tool> --help`.
- **One image/edit tool may take reference images** (e.g. `--image_input <url> ...`);
  array flags accept multiple values: `--image_input url1 url2`.
- **Don't hardcode the model list.** New models appear over time; `kie-cli --help` is
  always current.
- **Upload tools return `file_url`** — use this URL in any tool that accepts
  `*_urls` parameters (reference images, first frames, etc.).

## Fork-specific Notes

This skill uses the **dobexx fork** (https://github.com/dobexx/kie-cli-mcp).
Key differences from upstream:

| Feature | Upstream (felores) | dobexx Fork |
|---------|-------------------|-------------|
| Seedance | 2.0 modes only | **+ 2.5 mode (30s, more refs)** |
| Grok Imagine | text-to-image only | **+ image-to-image mode** |
| File Upload | not available | **upload_file, get_upload_url** |
| Upload Widget | not available | **browser-based upload UI** |

For the latest updates, check: https://github.com/dobexx/kie-cli-mcp
