import { z } from "zod";
import type { ToolDef, ToolContext, ToolResult } from "./types.js";

/**
 * Upload widget tool for MCP Apps (SEP-1865) with universal fallback.
 *
 * This tool declares a UI resource (ui://upload/form.html) that MCP-Apps-capable
 * hosts can render as an inline iframe widget. For clients without MCP Apps
 * support, it also returns a clickable link to open the widget in a browser.
 *
 * Flow (inline widget):
 * 1. Host detects _meta.ui.resourceUri → renders iframe
 * 2. User selects file in widget → widget POSTs to MCP server
 * 3. Server stores file, returns public URL
 * 4. Widget sends tools/call to notify model → model gets URL
 *
 * Flow (fallback link):
 * 1. Client doesn't support MCP Apps → shows the returned markdown link
 * 2. User clicks link → browser opens widget as standalone page
 * 3. User uploads file → gets URL displayed → pastes URL back to chat
 * 4. Model uses the pasted URL in subsequent tool calls
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
    const baseUrl =
      process.env.MCP_PUBLIC_URL || "http://localhost:3000";
    const widgetUrl = `${baseUrl}/ui/upload/form.html`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message:
                "Upload widget is ready. If the inline widget is not visible, " +
                "use the link below to open it in your browser.",
              widget_url: widgetUrl,
              usage:
                "Upload a file via the widget, then use the returned file_url in your next tool call.",
              instructions_for_model:
                "Present the widget_url as a clickable markdown link to the user: " +
                `[📎 Open Upload Widget](${widgetUrl})`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
