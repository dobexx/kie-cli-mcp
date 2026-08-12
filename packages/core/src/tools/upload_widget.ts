import { z } from "zod";
import type { ToolDef, ToolContext, ToolResult } from "./types.js";

/**
 * Upload widget tool for MCP Apps (SEP-1865).
 *
 * This tool declares a UI resource (ui://upload/form.html) that hosts
 * can render as an inline iframe widget. The widget allows users to
 * select and upload files directly, bypassing base64/URL workarounds.
 *
 * Flow:
 * 1. Host detects _meta.ui.resourceUri → renders iframe
 * 2. User selects file in widget → widget POSTs to MCP server
 * 3. Server stores file, returns public URL
 * 4. Widget sends tools/call to notify model → model gets URL
 */
export const UploadWidgetSchema = z.object({
  // No input parameters needed – the widget handles everything
});

export type UploadWidgetRequest = z.infer<typeof UploadWidgetSchema>;

export const uploadWidgetTool: ToolDef<typeof UploadWidgetSchema> = {
  name: "upload_widget",
  description:
    "Open an upload widget to select and upload a file. The user picks a file in the rendered UI, it gets uploaded, and the resulting public URL is returned for use in other tools (e.g. reference_image_urls).",
  category: "utility",
  schema: UploadWidgetSchema,
  // MCP Apps: declare the UI resource
  // @ts-expect-error – _meta is part of MCP spec, not in ToolDef type yet
  _meta: {
    ui: {
      resourceUri: "ui://upload/form.html",
      visibility: ["model", "app"],
    },
    // Legacy flat key for older hosts
    "ui/resourceUri": "ui://upload/form.html",
  },
  async run(_args, ctx: ToolContext): Promise<ToolResult> {
    // The actual upload happens in the widget, not here.
    // This tool just returns instructions for the model.
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message:
                "Upload widget opened. The user can now select a file to upload. " +
                "Once uploaded, the widget will call back with the file URL.",
              usage:
                "Wait for the widget to complete the upload, then use the provided file_url in your next tool call.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
