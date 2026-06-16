import React, { useRef, useState } from "react";
import type { AssetType, MediaAsset } from "../lib/mediaTypes";
import { API_BASE } from "../lib/apiBase";

type PresetTemplate = {
  id: string;
  category: string;
  title: string;
  desc: string;
  tag: string;
  prompt: string;
};

const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: "s1", category: "Soccer", title: "Stadium Soccer Match", desc: "Packed stadium under high-intensity lights", tag: "Hot🔥", prompt: "Cinematic packed soccer stadium under bright lights, dramatic atmosphere" },
  { id: "s2", category: "Soccer", title: "Street Soccer at Sunset", desc: "Rooftop / street-style rapid game", tag: "Trendy", prompt: "Street soccer match on a city rooftop at golden hour sunset, cinematic" },
  { id: "b1", category: "Basketball", title: "Urban Basketball Night Game", desc: "Outdoor court under city neon glow", tag: "Cool", prompt: "Gritty urban outdoor basketball court at night, glowing neon rims, hyper-realistic" },
  { id: "b2", category: "Basketball", title: "Slam Dunk Slow Motion", desc: "Dramatic high-flying dunk highlight", tag: "Pro", prompt: "Extreme close up slow-motion slam dunk highlight, floating dust particles, explosive action" },
  { id: "a1", category: "Anime", title: "Anime City Rooftop Battle", desc: "Neon rooftop fast-paced cyberpunk fight", tag: "Epic⚔️", prompt: "High energy anime city rooftop battle, glowing neon katanas, dynamic movement lines" },
  { id: "a2", category: "Anime", title: "Anime Training Ground", desc: "Softer aesthetic cherry blossom training scene", tag: "Chill", prompt: "Beautiful serene anime training ground, cherry blossom petals falling, soft sun rays" },
  { id: "f1", category: "Dragons / Fantasy", title: "Dragon Over Mountain Peaks", desc: "Massive dragon flying over snowy peaks", tag: "Mythic", prompt: "Epic scale fantasy dragon soaring over ancient jagged snowy mountain peaks, hyper-detailed" },
  { id: "f2", category: "Dragons / Fantasy", title: "Neon Dragon Above Future City", desc: "Glowing cybernetic dragon over a future city", tag: "Cyber", prompt: "Colossal glowing neon cyber dragon wrapping around futuristic skyscraper city skyline, cyberpunk aesthetic" },
];

type ActiveToolKind =
  | "select"
  | "text"
  | "adjust"
  | "transition"
  | "elements"
  | "timeline";

// Simple chat message shape for the Agent sidebar tab
type AgentChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type CanvaSidebarProps = {
  assets: MediaAsset[];
  setAssets: React.Dispatch<React.SetStateAction<MediaAsset[]>>;
  assetsLoading: boolean;
  assetsError: string | null;
  assetType: AssetType;
  setAssetType: (type: AssetType) => void;
  loadAssets: () => void | Promise<void>;
  handleAssetSelect: (asset: MediaAsset) => void;
  handleAssetUpload: (file: File) => void;
  // Optional hook back into the editor to switch the active tool panel
  setActiveTool?: (tool: ActiveToolKind) => void;
  // Optional external control for the active sidebar tab (e.g. from the editor timeline)
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  // Optional filter applied to the Uploads asset list
  assetFilterQuery?: string;
  // Timeline + canvas integration hooks
  onAddBlankCanvas?: () => void;
  onAddTextLayer?: (tier: "heading" | "subheading" | "body") => void;
  onApplyTemplate?: (templateId: string) => void;
  onSelectBrandColor?: (color: string) => void;
  onOpenProject?: (projectId: string) => void;
  onFilterAssets?: (query: string, category?: AssetType) => void;
  onAddElementSticker?: (emoji: string) => void;
  onSelectTransitionTemplateFromSidebar?: (templateId: string) => void;
  onSelectPromptPreset?: (promptText: string) => void;
};

export default function CanvaSidebar({
  assets,
  setAssets, // currently unused but passed so the sidebar owns the bridge to editor state
  assetsLoading,
  assetsError,
  assetType,
  setAssetType,
  loadAssets,
  handleAssetSelect,
  handleAssetUpload,
  setActiveTool,
  activeTab: controlledActiveTab,
  setActiveTab: setActiveTabProp,
  assetFilterQuery,
  onAddBlankCanvas,
  onAddTextLayer,
  onApplyTemplate,
  onSelectBrandColor,
  onOpenProject,
  onFilterAssets,
  onAddElementSticker,
  onSelectTransitionTemplateFromSidebar,
  onSelectPromptPreset,
}: CanvaSidebarProps) {
  const [internalActiveTab, setInternalActiveTab] = useState("Elements");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = setActiveTabProp ?? setInternalActiveTab;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [appResults, setAppResults] = useState<string[]>([]);
  const [elementsQuery, setElementsQuery] = useState("");
  // Controls whether the white drawer panel is visible. The icon rail
  // on the left always remains; selecting an action from the drawer
  // will auto-close it so the canvas has more room.
  const [drawerOpen, setDrawerOpen] = useState(true);

  // Agent chat state (for the Agent tab in the editor sidebar)
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentIsSending, setAgentIsSending] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  async function handleAgentSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = agentInput.trim();
    if (!trimmed || agentIsSending) return;

    const userMessage: AgentChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };

    setAgentMessages((prev) => [...prev, userMessage]);
    setAgentInput("");
    setAgentIsSending(true);
    setAgentError(null);

    try {
      const res = await fetch(`${API_BASE}/api/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      let rawBody: string | null = null;
      let data: any = null;
      try {
        rawBody = await res.text();
        if (rawBody) {
          try {
            data = JSON.parse(rawBody);
          } catch (jsonErr) {
            // eslint-disable-next-line no-console
            console.error("Failed to parse /api/ai/generate JSON:", jsonErr);
          }
        }
      } catch (bodyErr) {
        // eslint-disable-next-line no-console
        console.error("Failed to read /api/ai/generate response body:", bodyErr);
      }

      if (!res.ok || !data?.ok) {
        const backendError =
          (data && (data.error || data.message)) ||
          rawBody ||
          `Agent request failed (HTTP ${res.status} ${res.statusText})`;

        const msg =
          typeof backendError === "string"
            ? backendError
            : JSON.stringify(backendError);
        throw new Error(msg);
      }

      const assistantText: string =
        (data.text && String(data.text)) || "(Agent did not return any text.)";

      const assistantMessage: AgentChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: assistantText,
      };

      setAgentMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Agent sidebar chat error:", err);
      setAgentError(err?.message || "Agent request failed.");
    } finally {
      setAgentIsSending(false);
    }
  }

  const closeDrawer = () => setDrawerOpen(false);

  const tabs = [
    { name: "Templates", icon: "🔲" },
    { name: "Elements", icon: "🔺" },
    { name: "Text", icon: "🇹" },
    { name: "Brand", icon: "👑" },
    { name: "Uploads", icon: "📤" },
    { name: "Transitions", icon: "✨" },
    { name: "Projects", icon: "📂" },
    { name: "Apps", icon: "📱" },
    { name: "Agent", icon: "🤖" },
  ];

  const recentlyUsed = [
    { id: 1, img: "🦆", name: "Duck" },
    { id: 2, img: "🐒", name: "Monkey" },
    { id: 3, img: "🦆", name: "Duck 2" },
    { id: 4, img: "🦆", name: "Duck 3" },
  ];

  const popularSearches = ["Square", "Circle", "Youtube", "Frame", "Arrow"];

  const categories = [
    { name: "Audio", icon: "🎵", bg: "#fee2e2" },
    { name: "Videos", icon: "🎬", bg: "#fae8ff" },
    { name: "Photos", icon: "🖼️", bg: "#dbeafe" },
  ];

  const uploadsSubTabs: { id: AssetType; label: string }[] = [
    { id: "image", label: "Images" },
    { id: "video", label: "Videos" },
    { id: "audio", label: "Audio" },
  ];

  const activeAssets = assets.filter((asset) => {
    const isTypeMatch = asset.type === assetType;
    const isActiveStatus = !asset.status || asset.status === "active";
    const query = (assetFilterQuery || "").toLowerCase();
    const matchesQuery = !query || asset.originalName.toLowerCase().includes(query);
    return isTypeMatch && isActiveStatus && matchesQuery;
  });

  const currentSubTabLabel =
    uploadsSubTabs.find((t) => t.id === assetType)?.label ?? "Uploads";

  const inputAccept =
    assetType === "video" ? "video/*" : assetType === "image" ? "image/*" : "audio/*";

  return (
    <div style={styles.sidebarLayoutWrapper}>
      <div style={styles.navRail}>
        {/* Add Canvas (blank white segment) button at top of rail */}
        <button
          type="button"
          style={styles.addCanvasButton}
          title="Add blank canvas clip to timeline"
          onClick={() => {
            if (onAddBlankCanvas) {
              onAddBlankCanvas();
            }
          }}
        >
          +
        </button>

        {tabs.map((tab) => {
          const isActive = tab.name === activeTab;
          return (
            <div
              key={tab.name}
              onClick={() => {
                // If clicking the same tab while the drawer is open,
                // treat it as a toggle to close the task panel.
                if (drawerOpen && isActive) {
                  setDrawerOpen(false);
                  // If we're closing the Transitions tab, also
                  // switch the main editor tool back to Select so
                  // the transition panel in the editor collapses.
                  if (tab.name === "Transitions" && setActiveTool) {
                    setActiveTool("select");
                  }
                  return;
                }
                // Otherwise open the drawer and switch tabs.
                setDrawerOpen(true);
                setActiveTab(tab.name);
                // Clicking the dedicated Transitions icon should also
                // open the transition tool drawer in the main editor.
                if (tab.name === "Transitions" && setActiveTool) {
                  setActiveTool("transition");
                }
              }}
              style={{
                ...styles.railTabButton,
                color: isActive ? "#8b3dff" : "#0f172a",
                background: isActive ? "#f8fafc" : "transparent",
                fontWeight: isActive ? 700 : 500,
              }}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              <span style={styles.tabLabel}>{tab.name}</span>
              {isActive && <div style={styles.activeIndicatorLine} />}
            </div>
          );
        })}
      </div>

      {drawerOpen && activeTab === "Templates" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Storyboard templates</h3>
              <span style={styles.seeAllTextLink}>Browse</span>
            </div>
            <div style={styles.templateGrid}>
              {[
                { id: "three-up", label: "Three 5s scenes" },
                { id: "intro-outro", label: "Intro + Main + Outro" },
              ].map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  style={styles.templateCard}
                  onClick={() => {
                    if (onApplyTemplate) {
                      onApplyTemplate(tmpl.id);
                    }
                    // Auto-close drawer once a template is applied.
                    closeDrawer();
                  }}
                >
                  <div style={styles.templateThumbnail}>
                    <div style={styles.templateStrip} />
                    <div style={{ ...styles.templateStrip, opacity: 0.7 }} />
                    <div style={{ ...styles.templateStrip, opacity: 0.4 }} />
                  </div>
                  <span style={styles.templateLabel}>{tmpl.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Templates & Presets high-engagement preview cards */}
          <div className="mt-4">
            <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-black px-3 py-3 shadow-[0_18px_60px_rgba(15,23,42,0.85)] text-[11px] text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-white/50">
                    Templates &amp; Presets
                  </span>
                  <span className="text-[11px] font-semibold text-white/85 mt-0.5">
                    One-tap sports &amp; fantasy shot ideas
                  </span>
                </div>
                <span className="hidden sm:inline text-[10px] text-purple-200/80">
                  Tap a card to pre-fill the AI prompt
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {PRESET_TEMPLATES.map((preset) => {
                  const icon =
                    preset.category === "Soccer"
                      ? "⚽"
                      : preset.category === "Basketball"
                      ? "🏀"
                      : preset.category === "Anime"
                      ? "🌌"
                      : "🐲";

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        if (onSelectPromptPreset) {
                          onSelectPromptPreset(preset.prompt);
                        }
                        // Auto-close drawer so the main workspace has focus.
                        closeDrawer();
                      }}
                      className="bg-white/5 border border-white/10 hover:border-purple-500/60 rounded-xl p-2.5 cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/40 uppercase text-[9px] font-bold tracking-wider">
                          {preset.category}
                        </span>
                      </div>

                      <span className="absolute top-2 right-2 bg-purple-600/30 text-purple-200 text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                        {preset.tag}
                      </span>

                      <div className="w-full h-20 bg-gradient-to-br from-purple-900/30 to-black/50 rounded-lg mb-2 flex items-center justify-center border border-white/5 group-hover:from-purple-800/40">
                        <span className="text-2xl">{icon}</span>
                      </div>

                      <div className="mt-1">
                        <div className="text-white/90 font-semibold text-[11px] leading-tight">
                          {preset.title}
                        </div>
                        <p className="text-white/50 text-[9px] line-clamp-2 mt-0.5">
                          {preset.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Elements" && (
        <div style={styles.contentDrawer}>
          {/* Search region */}
          <div style={styles.searchContainerWrapper}>
            <input
              type="text"
              placeholder="+ Describe your ideal element"
              value={elementsQuery}
              onChange={(e) => setElementsQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = elementsQuery.trim();
                  if (onFilterAssets) {
                    onFilterAssets(q, "image");
                  }
                  setActiveTab("Uploads");
                }
              }}
              style={styles.searchBarInput}
            />
            <span style={styles.microphoneIcon}>🎙️</span>
          </div>

          {/* Action buttons */}
          <div style={styles.actionButtonGroupRow}>
            <button
              type="button"
              style={styles.generateSelectDropdown}
              onClick={() => {
                if (onAddElementSticker) {
                  const label = elementsQuery.trim() || "⭐";
                  onAddElementSticker(label);
                }
                // Close drawer after inserting a generated element.
                closeDrawer();
              }}
            >
              Generate <span>▼</span>
            </button>
            <button
              type="button"
              style={styles.purpleSearchButton}
              onClick={() => {
                const q = elementsQuery.trim();
                if (onFilterAssets) {
                  // Elements search defaults to Images so results feel
                  // consistent with stickers and shapes.
                  onFilterAssets(q, "image");
                }
                setActiveTab("Uploads");
              }}
            >
              Search
            </button>
          </div>

          {/* Recently used */}
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Recently used</h3>
              <span style={styles.seeAllTextLink}>See all</span>
            </div>
            <div style={styles.horizontalStickerTrack}>
              {recentlyUsed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  style={styles.stickerCardItem}
                  onClick={() => {
                    if (onAddElementSticker) {
                      onAddElementSticker(item.img);
                    }
                    // Auto-close drawer after inserting a sticker.
                    closeDrawer();
                  }}
                >
                  <span style={{ fontSize: "28px" }}>{item.img}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recommended for you */}
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Recommended for you</h3>
              <span style={styles.seeAllTextLink}>See all</span>
            </div>
            <div style={styles.horizontalStickerTrack}>
              {[...recentlyUsed].reverse().map((item) => (
                <button
                  key={`rec-${item.id}`}
                  type="button"
                  style={styles.stickerCardItem}
                  onClick={() => {
                    if (onAddElementSticker) {
                      onAddElementSticker(item.img);
                    }
                    closeDrawer();
                  }}
                >
                  <span style={{ fontSize: "28px" }}>{item.img}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Popular searches */}
          <div style={styles.sectionBlock}>
            <h3 style={styles.sectionTitleText}>Popular searches</h3>
            <div style={styles.flexPillTagCloud}>
              {popularSearches.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  style={styles.bubbleTagBadge}
                  onClick={() => {
                    setElementsQuery(tag);
                    if (onFilterAssets) {
                      onFilterAssets(tag.toLowerCase(), "image");
                    }
                    // Switch into Uploads to show filtered assets but
                    // keep the drawer open so the user can pick one.
                    setDrawerOpen(true);
                    setActiveTab("Uploads");
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Browse categories */}
          <div style={styles.sectionBlock}>
            <h3 style={styles.sectionTitleText}>Browse categories</h3>
            <div style={styles.threeColumnGridMatrix}>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  style={{
                    ...styles.categorySquareGridCard,
                    background: cat.bg,
                  }}
                  onClick={() => {
                    const categoryType: AssetType =
                      cat.name === "Audio"
                        ? "audio"
                        : cat.name === "Videos"
                        ? "video"
                        : "image";
                    if (onFilterAssets) {
                      onFilterAssets("", categoryType);
                    }
                    setDrawerOpen(true);
                    setActiveTab("Uploads");
                  }}
                >
                  <span style={{ fontSize: "20px", marginBottom: "4px" }}>{cat.icon}</span>
                  <span style={styles.categoryCardTextLabel}>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Text" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Add text</h3>
            </div>
            <div style={styles.textButtonColumn}>
              <button
                type="button"
                style={styles.textTierButton}
                onClick={() => {
                  if (onAddTextLayer) onAddTextLayer("heading");
                  closeDrawer();
                }}
              >
                <div style={styles.textTierTitle}>Heading</div>
                <div style={styles.textTierSubtitle}>Add a big title</div>
              </button>
              <button
                type="button"
                style={styles.textTierButton}
                onClick={() => {
                  if (onAddTextLayer) onAddTextLayer("subheading");
                  closeDrawer();
                }}
              >
                <div style={styles.textTierTitle}>Subheading</div>
                <div style={styles.textTierSubtitle}>Perfect for section titles</div>
              </button>
              <button
                type="button"
                style={styles.textTierButton}
                onClick={() => {
                  if (onAddTextLayer) onAddTextLayer("body");
                  closeDrawer();
                }}
              >
                <div style={styles.textTierTitle}>Body text</div>
                <div style={styles.textTierSubtitle}>Smaller descriptive copy</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Transitions" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Transitions</h3>
            </div>
            <div style={styles.templateGrid}>
              {[
                { id: "fade", label: "Fade" },
                { id: "crossfade", label: "Crossfade" },
                { id: "slide", label: "Slide" },
                { id: "zoom", label: "Zoom" },
                { id: "circle", label: "Circle" },
              ].map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  style={styles.templateCard}
                  onClick={() => {
                    if (onSelectTransitionTemplateFromSidebar) {
                      onSelectTransitionTemplateFromSidebar(tmpl.id);
                    }
                    // Close after choosing a transition template.
                    closeDrawer();
                  }}
                >
                  <span style={styles.templateLabel}>{tmpl.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Brand" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Brand colors</h3>
            </div>
            <div style={styles.brandColorRow}>
              {[
                { name: "Purple", color: "#8b3dff" },
                { name: "Gold", color: "#fbbf24" },
                { name: "Black", color: "#000000" },
              ].map((c) => (
                <button
                  key={c.name}
                  type="button"
                  style={{
                    ...styles.brandColorSwatch,
                    backgroundColor: c.color,
                  }}
                  title={c.name}
                  onClick={() => {
                    if (onSelectBrandColor) {
                      onSelectBrandColor(c.color);
                    }
                    closeDrawer();
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>
                Custom canvas color
              </label>
              <input
                type="color"
                onChange={(e) => {
                  if (onSelectBrandColor) {
                    onSelectBrandColor(e.target.value);
                  }
                }}
                style={{
                  width: "100%",
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  padding: 0,
                  cursor: "pointer",
                  background: "transparent",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
              Brand colors tint the canvas background and blank segments.
            </div>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Projects" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Recent designs</h3>
            </div>
            <div style={styles.projectList}>
              {["Last session", "Storyboard draft"].map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  style={styles.projectItem}
                  onClick={() => {
                    if (onOpenProject) {
                      onOpenProject(`project-${idx}`);
                    }
                    closeDrawer();
                  }}
                >
                  <span style={styles.projectThumb}>🎬</span>
                  <div style={styles.projectMeta}>
                    <span style={styles.projectTitle}>{label}</span>
                    <span style={styles.projectSubtitle}>Restore timeline & canvas</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Apps" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Apps</h3>
            </div>
            <div style={styles.appGrid}>
              <button
                type="button"
                style={styles.appCard}
                onClick={() => {
                  setActiveApp("giphy");
                  setAppResults([]);
                }}
              >
                <span style={styles.appEmoji}>🎞️</span>
                <span style={styles.appTitle}>Giphy integration</span>
                <span style={styles.appSubtitle}>Search animated GIFs</span>
              </button>
              <button
                type="button"
                style={styles.appCard}
                onClick={() => {
                  setActiveApp("ai-image");
                  setAppResults([]);
                }}
              >
                <span style={styles.appEmoji}>✨</span>
                <span style={styles.appTitle}>AI Image generator</span>
                <span style={styles.appSubtitle}>Create images from prompts</span>
              </button>
            </div>

            {activeApp && (
              <div style={styles.appSearchPanel}>
                <div style={styles.sectionHeaderRow}>
                  <h3 style={styles.sectionTitleText}>
                    {activeApp === "giphy" ? "Search Giphy" : "Generate images"}
                  </h3>
                </div>
                <div style={styles.searchContainerWrapper}>
                  <input
                    type="text"
                    placeholder={
                      activeApp === "giphy"
                        ? "Search GIFs (mock search)"
                        : "Describe the image you want"
                    }
                    value={appSearchQuery}
                    onChange={(e) => setAppSearchQuery(e.target.value)}
                    style={styles.searchBarInput}
                  />
                </div>
                <button
                  type="button"
                  style={{ ...styles.purpleSearchButton, marginTop: 8 }}
                  onClick={() => {
                    if (!appSearchQuery.trim()) {
                      setAppResults([]);
                      return;
                    }
                    // Mock results – in a real integration we would call the
                    // external API and map items into asset cards.
                    setAppResults([
                      `${appSearchQuery} result 1`,
                      `${appSearchQuery} result 2`,
                      `${appSearchQuery} result 3`,
                    ]);
                  }}
                >
                  Search
                </button>

                <div style={styles.appResultsList}>
                  {appResults.map((r) => (
                    <div key={r} style={styles.appResultItem}>
                      {r}
                    </div>
                  ))}
                  {appResults.length === 0 && (
                    <div style={styles.assetsEmptyState}>
                      No results yet. Try a search term.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Agent" && (
        <div style={styles.contentDrawer}>
          <div style={styles.sectionBlock}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitleText}>Agent chat</h3>
            </div>
            <div
              className="h-64 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/90 p-3 space-y-3"
            >
              {agentMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
                  Start a conversation with Sailor AI. For example: "Brainstorm 5 short video
                  ideas for my product".
                </div>
              ) : (
                <div className="space-y-3">
                  {agentMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                        m.role === "user"
                          ? "ml-auto bg-cyan-500/20 border border-cyan-300/60 text-cyan-50"
                          : "mr-auto bg-white/5 border border-white/15 text-white/85"
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {agentError && (
              <div className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-1.5">
                {agentError}
              </div>
            )}

            <form
              onSubmit={handleAgentSend}
              className="mt-3 flex flex-col gap-2"
            >
              <input
                type="text"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="Ask the agent anything about your videos, prompts, or edits…"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/80"
              />
              <button
                type="submit"
                disabled={agentIsSending || !agentInput.trim()}
                className={`w-full px-4 py-2 rounded-2xl text-xs font-semibold border transition-colors text-center ${
                  agentIsSending || !agentInput.trim()
                    ? "border-white/20 bg-white/10 text-white/40 cursor-not-allowed"
                    : "border-cyan-400 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                }`}
              >
                {agentIsSending ? "Thinking…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}

      {drawerOpen && activeTab === "Uploads" && (
        <div style={styles.contentDrawer}>
          <div style={styles.uploadsHeaderRow}>
            <div>
              <h2 style={styles.uploadsTitle}>Asset Uploads</h2>
              <div style={styles.uploadsSubtitle}>Manage your {currentSubTabLabel.toLowerCase()} for this project.</div>
            </div>
            <button
              type="button"
              onClick={() => loadAssets()}
              style={styles.refreshButton}
            >
              Refresh
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={inputAccept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleAssetUpload(file);
                // Reset input so same file can be uploaded again
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }
            }}
            style={{ display: "none" }}
          />

          {/* Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: "100%",
              padding: "12px 16px",
              marginBottom: "16px",
              backgroundColor: "#8b3dff",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📤 Upload {assetType === "video" ? "Video" : assetType === "image" ? "Image" : "Audio"}
          </button>

          {/* Sub-tabs for Images / Videos / Audio */}
          <div style={styles.uploadsSubTabRow}>
            {uploadsSubTabs.map((subTab) => {
              const isActive = subTab.id === assetType;
              return (
                <button
                  key={subTab.id}
                  type="button"
                  onClick={() => setAssetType(subTab.id)}
                  style={{
                    ...styles.uploadsSubTabButton,
                    backgroundColor: isActive ? "#0f172a" : "#e5e7eb",
                    color: isActive ? "#f9fafb" : "#111827",
                    borderColor: isActive ? "#0f172a" : "#d1d5db",
                  }}
                >
                  {subTab.label}
                </button>
              );
            })}
          </div>

          {/* Assets grid */}
          <div style={styles.assetsSectionWrapper}>
            {assetsLoading && (
              <div style={styles.assetsLoadingText}>Loading assets...</div>
            )}
            {!assetsLoading && activeAssets.length === 0 && (
              <div style={styles.assetsEmptyState}>No {currentSubTabLabel.toLowerCase()} yet. Upload a file to get started.</div>
            )}
            {assetsError && !assetsLoading && (
              <div style={styles.assetsErrorText}>{assetsError}</div>
            )}

            <div style={styles.assetGrid}>
              {activeAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    handleAssetSelect(asset);
                    // Close drawer after an asset is placed on the canvas/timeline.
                    closeDrawer();
                  }}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", asset.id);
                    event.dataTransfer.effectAllowed = "copyMove";
                  }}
                  style={styles.assetCard}
                >
                  <div style={styles.assetThumbWrapper}>
                    {asset.type === "image" && (
                      <img
                        src={asset.publicUrl}
                        alt={asset.originalName}
                        style={styles.assetThumbImage}
                      />
                    )}
                    {asset.type === "video" && (
                      <div style={styles.assetThumbVideoShell}>
                        <video
                          src={asset.publicUrl}
                          muted
                          playsInline
                          style={styles.assetThumbVideo}
                        />
                        <div style={styles.assetThumbVideoOverlay} />
                      </div>
                    )}
                    {asset.type === "audio" && (
                      <div style={styles.assetThumbAudioWave}>
                        <div style={styles.waveBarShort} />
                        <div style={styles.waveBarTall} />
                        <div style={styles.waveBarMedium} />
                        <div style={styles.waveBarTall} />
                        <div style={styles.waveBarShort} />
                      </div>
                    )}
                  </div>
                  <div style={styles.assetCardLabel}>
                    <span style={styles.assetCardTitle}>{asset.originalName}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  sidebarLayoutWrapper: {
    display: "flex",
    flexDirection: "row",
    height: "100vh", // fill full viewport height so the sidebar reaches the bottom
    background: "#ffffff",
    fontFamily: "system-ui, sans-serif",
    boxSizing: "border-box",
    borderRight: "1px solid #e2e8f0",
    overflow: "hidden", // lock global container; scrolling happens inside the task panel only
  },
  navRail: {
    width: "72px",
    height: "100%",
    background: "#ffffff",
    borderRight: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    paddingTop: "16px",
    boxSizing: "border-box",
    flexShrink: 0, // keep icon column fixed; do not shrink when content scrolls
  },
  addCanvasButton: {
    width: "40px",
    height: "40px",
    borderRadius: "999px",
    border: "1px solid #e2e8f0",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    color: "#f9fafb",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  railTabButton: {
    width: "64px",
    height: "64px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: "8px",
    position: "relative",
  },
  tabIcon: {
    fontSize: "20px",
    marginBottom: "4px",
  },
  tabLabel: {
    fontSize: "10px",
    textAlign: "center",
  },
  activeIndicatorLine: {
    position: "absolute",
    left: "2px",
    top: "20px",
    bottom: "20px",
    width: "3px",
    background: "#8b3dff",
    borderRadius: "0 4px 4px 0",
  },
  contentDrawer: {
    width: "320px",
    height: "100%",
    background: "#ffffff",
    padding: "16px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflowY: "scroll", // scrollbar lives inside the task bar panel (icons stay fixed)
  },
  searchContainerWrapper: {
    position: "relative",
    width: "100%",
  },
  searchBarInput: {
    width: "100%",
    padding: "10px 36px 10px 12px",
    borderRadius: "4px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
    outline: "none",
  },
  microphoneIcon: {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    cursor: "pointer",
    fontSize: "14px",
  },
  actionButtonGroupRow: {
    display: "flex",
    flexDirection: "row",
    gap: "8px",
    width: "100%",
  },
  generateSelectDropdown: {
    background: "#f1f5f9",
    border: "none",
    borderRadius: "4px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  purpleSearchButton: {
    flex: 1,
    background: "#8b3dff",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    padding: "10px 0",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center",
  },
  sectionBlock: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  sectionHeaderRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  sectionTitleText: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
  },
  seeAllTextLink: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
  },
  horizontalStickerTrack: {
    display: "flex",
    flexDirection: "row",
    gap: "12px",
    width: "100%",
    overflowX: "auto",
    paddingBottom: "4px",
  },
  stickerCardItem: {
    minWidth: "60px",
    height: "60px",
    background: "#f8fafc",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  flexPillTagCloud: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  },
  bubbleTagBadge: {
    background: "#f1f5f9",
    borderRadius: "100px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: 500,
    color: "#334155",
    cursor: "pointer",
    border: "1px solid #e2e8f0",
  },
  threeColumnGridMatrix: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
    marginTop: "8px",
  },
  templateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  templateCard: {
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    padding: 8,
    backgroundColor: "#f9fafb",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  templateThumbnail: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  templateStrip: {
    height: 6,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(148,163,184,1), rgba(96,165,250,1))",
  },
  templateLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#111827",
  },
  categorySquareGridCard: {
    height: "64px",
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  categoryCardTextLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#1e293b",
  },
  textButtonColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  textTierButton: {
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    padding: "10px 12px",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  textTierTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  },
  textTierSubtitle: {
    fontSize: 11,
    color: "#6b7280",
  },
  brandColorRow: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  brandColorSwatch: {
    width: 28,
    height: 28,
    borderRadius: "999px",
    border: "2px solid #e5e7eb",
    cursor: "pointer",
  },
  projectList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  projectItem: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
  },
  projectThumb: {
    fontSize: 18,
  },
  projectMeta: {
    display: "flex",
    flexDirection: "column" as const,
  },
  projectTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#111827",
  },
  projectSubtitle: {
    fontSize: 11,
    color: "#6b7280",
  },
  appGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  appCard: {
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    padding: 8,
    backgroundColor: "#f9fafb",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: 4,
  },
  appEmoji: {
    fontSize: 18,
  },
  appTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#111827",
  },
  appSubtitle: {
    fontSize: 11,
    color: "#6b7280",
  },
  appSearchPanel: {
    marginTop: 16,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  appResultsList: {
    marginTop: 8,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  appResultItem: {
    fontSize: 11,
    color: "#111827",
    padding: 4,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
  },
  uploadsHeaderRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },
  uploadsTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 700,
    color: "#020617",
  },
  uploadsSubtitle: {
    marginTop: 2,
    fontSize: "11px",
    color: "#6b7280",
  },
  refreshButton: {
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    padding: "4px 10px",
    fontSize: "11px",
    backgroundColor: "#f9fafb",
    color: "#111827",
    cursor: "pointer",
  },
  uploadButtonWrapper: {
    marginTop: 12,
    marginBottom: 8,
  },
  primaryUploadButton: {
    width: "100%",
    borderRadius: "999px",
    border: "none",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 700,
    background:
      "linear-gradient(135deg, #4f46e5 0%, #7c3aed 40%, #ec4899 80%, #f97316 100%)",
    color: "#f9fafb",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 14px 45px rgba(15,23,42,0.35)",
  },
  uploadsSubTabRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "8px",
    marginTop: 10,
  },
  uploadsSubTabButton: {
    borderRadius: "999px",
    borderWidth: 1,
    borderStyle: "solid",
    padding: "6px 0",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  assetsSectionWrapper: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  assetsLoadingText: {
    fontSize: "12px",
    color: "#6b7280",
  },
  assetsEmptyState: {
    fontSize: "12px",
    color: "#9ca3af",
  },
  assetsErrorText: {
    fontSize: "12px",
    color: "#b91c1c",
  },
  assetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  assetCard: {
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    padding: 6,
    backgroundColor: "#f9fafb",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    justifyContent: "flex-start",
    boxShadow: "0 2px 6px rgba(15,23,42,0.06)",
  },
  assetThumbWrapper: {
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    width: "100%",
    paddingBottom: "100%", // square
    backgroundColor: "#020617",
  },
  assetThumbImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  assetThumbVideoShell: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 8,
  },
  assetThumbVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  assetThumbVideoOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to top, rgba(15,23,42,0.8), transparent 40%, rgba(15,23,42,0.5))",
  },
  assetThumbAudioWave: {
    position: "absolute",
    inset: 10,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 2,
  },
  waveBarShort: {
    width: 4,
    height: "40%",
    borderRadius: 999,
    background:
      "linear-gradient(to top, rgba(15,23,42,0.9), rgba(148,163,184,1))",
  },
  waveBarMedium: {
    width: 4,
    height: "65%",
    borderRadius: 999,
    background:
      "linear-gradient(to top, rgba(15,23,42,0.9), rgba(96,165,250,1))",
  },
  waveBarTall: {
    width: 4,
    height: "90%",
    borderRadius: 999,
    background:
      "linear-gradient(to top, rgba(15,23,42,0.9), rgba(34,197,94,1))",
  },
  assetCardLabel: {
    marginTop: 6,
  },
  assetCardTitle: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#111827",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
};
