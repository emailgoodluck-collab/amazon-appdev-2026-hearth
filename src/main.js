import { HearthMcpClient } from "./mcp-client.js";
import { classifyPrompt, summarizeEveningPlan } from "./prompt-commands.js";
import { createSpeechRecognition } from "./voice-input.js";

const planElement = document.querySelector("#timeline");
const conversation = document.querySelector("#conversation");
const form = document.querySelector("#request-form");
const input = document.querySelector("#request-input");
const dialog = document.querySelector("#share-dialog");
const sharePreview = document.querySelector("#share-preview");
const feedback = document.querySelector("#dialog-feedback");
const toast = document.querySelector("#toast");
const planStatus = document.querySelector("#plan-status");
const nudgeText = document.querySelector("#nudge-text");
const timerState = document.querySelector("#timer-state");
const entryLightState = document.querySelector("#entry-light-state");
const copyButton = document.querySelector("#copy-share");
const voiceButton = document.querySelector("#voice-button");
const availability = document.querySelector(".availability");
const shareButton = document.querySelector("#share-button");
const resetButton = document.querySelector("#reset-demo");
const undoButton = document.querySelector("#undo-change");
const changeStatus = document.querySelector("#change-status");
const changeReply = document.querySelector("#change-reply");
const changeList = document.querySelector("#change-list");
const voiceStatus = document.querySelector("#voice-status");
const scenarioButtons = [...document.querySelectorAll("[data-scenario]")];

const mcp = new HearthMcpClient();
let plan = null;
let busy = false;
let canUndo = false;
let isListening = false;
let toastTimer;
const recognition = createSpeechRecognition({
  onStart() {
    isListening = true;
    voiceButton.classList.add("voice-button--active");
    voiceButton.setAttribute("aria-label", "Stop listening");
    voiceButton.title = "Stop listening";
    voiceStatus.textContent = "Listening… say a short request.";
  },
  onTranscript({ transcript, isFinal }) {
    if (busy) return;
    if (isFinal) {
      input.value = transcript;
      voiceStatus.textContent = transcript
        ? "Transcript ready. Review it, then press Send to apply."
        : "No speech was recognized. Try again or type below.";
    } else {
      voiceStatus.textContent = `Hearing: ${transcript}`;
    }
  },
  onError(error) {
    const messages = {
      "not-allowed": "Microphone permission was blocked. Allow it in your browser settings, then try again.",
      "service-not-allowed": "Browser speech recognition is unavailable. You can type a request instead.",
      "audio-capture": "No microphone is available. You can type a request instead.",
      "no-speech": "I didn't hear anything. Tap the microphone and try again.",
      network: "The browser speech service had a network error. You can type a request instead.",
      "language-not-supported": "English speech recognition isn't available in this browser.",
    };
    voiceStatus.textContent = messages[error]
      ?? `Speech recognition failed (${error}). You can type a request instead.`;
  },
  onEnd() {
    isListening = false;
    voiceButton.classList.remove("voice-button--active");
    voiceButton.setAttribute("aria-label", "Start voice input");
    voiceButton.title = recognition
      ? "Start voice input. Your microphone is used only after you press this button."
      : "Voice input is unavailable in this browser.";
    if (voiceStatus.textContent === "Listening… say a short request.") {
      voiceStatus.textContent = "No speech was recognized. Try again or type below.";
    }
  },
});

function renderChangeLog(lastUpdate) {
  canUndo = Boolean(lastUpdate?.canUndo);
  undoButton.disabled = busy || !canUndo;
  changeStatus.textContent = canUndo ? "Ready to undo" : "Nothing to undo";
  changeReply.textContent = lastUpdate?.reply
    ?? "As Hearth adapts the demo, you'll see exactly what changed here.";
  changeList.replaceChildren();
  for (const change of lastUpdate?.changes ?? []) {
    const item = document.createElement("li");
    item.textContent = change;
    changeList.append(item);
  }
}

function renderTimeline() {
  planElement.innerHTML = plan.events.map((event, index) => `
    <li class="timeline-item ${index === 0 ? "timeline-item--first" : ""}" data-event="${event.id}">
      <div class="timeline-time"><strong>${event.time}</strong><span>${event.period}</span></div>
      <div class="timeline-track"><span class="timeline-dot timeline-dot--${event.tone}">${event.icon}</span>${index < plan.events.length - 1 ? '<span class="timeline-line"></span>' : ""}</div>
      <div class="timeline-event"><div class="timeline-event-top"><strong>${escapeHtml(event.title)}</strong><span class="event-state">${escapeHtml(event.state)}</span></div><span>${escapeHtml(event.detail)}</span></div>
    </li>`).join("");
  nudgeText.textContent = plan.nudge;
  timerState.textContent = plan.timer;
  entryLightState.textContent = plan.entryLight;
  planStatus.textContent = `${plan.events.length} moments · updated`;
}

function addConversationMessage(role, text, contextText = "") {
  const article = document.createElement("article");
  article.className = role === "user" ? "user-message" : "assistant-message";
  if (role === "assistant") {
    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "h";
    article.append(avatar);
  }

  const body = document.createElement("div");
  body.className = "message-body";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  body.append(paragraph);
  if (role === "assistant" && contextText) {
    const context = document.createElement("div");
    context.className = "message-context";
    const spark = document.createElement("span");
    spark.className = "context-spark";
    spark.textContent = "✳";
    context.append(spark, ` ${contextText}`);
    body.append(context);
  }
  article.append(body);
  conversation.append(article);
  conversation.scrollTop = conversation.scrollHeight;
}

function setBusy(value) {
  busy = value;
  if (value && isListening && recognition) recognition.stop();
  input.disabled = value;
  form.querySelector('[type="submit"]').disabled = value;
  voiceButton.disabled = value || !recognition;
  shareButton.disabled = value;
  resetButton.disabled = value;
  undoButton.disabled = value || !canUndo;
  scenarioButtons.forEach((button) => { button.disabled = value; });
}

function setConnectionStatus(connected) {
  const statusDot = document.createElement("span");
  availability.replaceChildren(statusDot, ` ${connected ? "MCP connected" : "MCP offline"}`);
  availability.classList.toggle("availability--offline", !connected);
}

async function submitRequest(request) {
  const normalized = String(request ?? "").trim();
  if (!normalized || busy) return;
  const command = classifyPrompt(normalized);
  setBusy(true);
  addConversationMessage("user", normalized);
  try {
    if (command === "help") {
      addConversationMessage(
        "assistant",
        "I can adjust a late pickup, get ready for Nana, make a quiet moment, read the plan, prepare a household update, undo a change, or reset this demo. Try one short request.",
        "Prompt guide · No changes made",
      );
      return;
    }

    if (command === "show-plan") {
      const result = await mcp.callTool("get_evening_plan");
      plan = result.plan;
      const summary = summarizeEveningPlan(plan);
      addConversationMessage("assistant", summary, "Shared plan · Personal reminders excluded");
      setConnectionStatus(true);
      return;
    }

    if (command === "preview-update") {
      await prepareSharePreview();
      addConversationMessage(
        "assistant",
        "The update is ready for you to review. Nothing has been sent.",
        "Preview prepared · Nothing sent",
      );
      return;
    }

    if (command === "reset-demo") {
      const result = await mcp.callTool("reset_demo_plan");
      plan = result.plan;
      renderChangeLog({ canUndo: false });
      renderTimeline();
      addConversationMessage("assistant", result.reply, "Demo reset · No real data changed");
      setConnectionStatus(true);
      return;
    }

    if (command === "undo") {
      const result = await mcp.callTool("undo_last_change");
      plan = result.plan;
      renderChangeLog({
        canUndo: result.canUndo,
        reply: result.reply,
        changes: result.changes,
      });
      if (result.changes.length) renderTimeline();
      addConversationMessage(
        "assistant",
        result.reply,
        result.changes.length ? "Change reversed · Local demo only" : "No changes made",
      );
      setConnectionStatus(true);
      return;
    }

    const result = await mcp.callTool("adjust_evening_plan", { request: normalized });
    plan = result.plan;
    if (result.updated) {
      renderChangeLog({
        canUndo: result.canUndo,
        reply: result.reply,
        changes: result.changes,
      });
    }
    addConversationMessage(
      "assistant",
      result.reply,
      result.updated ? "Plan updated · Personal reminders stay private" : "Demo guidance · No changes made",
    );
    if (result.updated) renderTimeline();
    setConnectionStatus(true);
  } catch (error) {
    addConversationMessage(
      "assistant",
      `I couldn't reach the local Hearth tools, so I didn't change the plan. ${error instanceof Error ? error.message : String(error)}`,
      "MCP offline · No changes made",
    );
    setConnectionStatus(false);
  } finally {
    if (input.value === normalized) input.value = "";
    setBusy(false);
    if (!isListening && !dialog.open) input.focus();
  }
}

async function prepareSharePreview() {
  feedback.textContent = "";
  sharePreview.textContent = "";
  copyButton.disabled = true;
  dialog.showModal();
  feedback.textContent = "Preparing preview with the local MCP tool…";
  try {
    const result = await mcp.callTool("preview_household_update");
    sharePreview.textContent = result.preview;
    copyButton.disabled = false;
    feedback.textContent = "Review this update. It has not been sent.";
    setConnectionStatus(true);
  } catch (error) {
    feedback.textContent = `Could not prepare a share preview: ${error instanceof Error ? error.message : String(error)}`;
    setConnectionStatus(false);
    throw error;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("toast--visible");
  toastTimer = setTimeout(() => toast.classList.remove("toast--visible"), 2800);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitRequest(input.value);
});

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    const requests = {
      "late-pickup": "The bus is running 12 minutes late. Can you make room?",
      "nana-arrival": "Nana is coming at six. Help us get ready.",
      "quiet-minute": "I need ten quiet minutes before dinner.",
    };
    void submitRequest(requests[button.dataset.scenario]);
  });
});

voiceButton.disabled = !recognition;
voiceButton.title = recognition
  ? "Start voice input. Your microphone is used only after you press this button."
  : "Voice input is unavailable in this browser.";
if (!recognition) {
  voiceStatus.textContent = "Voice input isn't supported here. Type a request or choose a prompt.";
}
voiceButton.addEventListener("click", () => {
  if (!recognition || busy) return;
  if (isListening) {
    recognition.stop();
    return;
  }

  voiceStatus.textContent = "Requesting microphone access…";
  isListening = true;
  try {
    recognition.start();
  } catch (error) {
    isListening = false;
    voiceStatus.textContent = `Couldn't start voice input: ${error instanceof Error ? error.message : String(error)}. You can type a request instead.`;
  }
});

shareButton.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    await prepareSharePreview();
  } catch (error) {
    addConversationMessage(
      "assistant",
      `I couldn't prepare the update. ${error instanceof Error ? error.message : String(error)}`,
      "MCP offline · Nothing sent",
    );
  } finally {
    setBusy(false);
  }
});

resetButton.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    const result = await mcp.callTool("reset_demo_plan");
    plan = result.plan;
    renderChangeLog({ canUndo: false });
    renderTimeline();
    addConversationMessage("assistant", result.reply, "Demo reset · No real data changed");
    setConnectionStatus(true);
  } catch (error) {
    addConversationMessage(
      "assistant",
      `I couldn't reset the demo because the local MCP tools are unavailable. ${error instanceof Error ? error.message : String(error)}`,
      "MCP offline · No changes made",
    );
    setConnectionStatus(false);
  } finally {
    setBusy(false);
  }
});

undoButton.addEventListener("click", async () => {
  if (busy || !canUndo) return;
  setBusy(true);
  try {
    const result = await mcp.callTool("undo_last_change");
    plan = result.plan;
    renderChangeLog({
      canUndo: result.canUndo,
      reply: result.reply,
      changes: result.changes,
    });
    renderTimeline();
    addConversationMessage("assistant", result.reply, "Change reversed · Local demo only");
    setConnectionStatus(true);
  } catch (error) {
    addConversationMessage(
      "assistant",
      `I couldn't undo that change because the local MCP tools are unavailable. ${error instanceof Error ? error.message : String(error)}`,
      "MCP offline · Plan unchanged",
    );
    setConnectionStatus(false);
  } finally {
    setBusy(false);
  }
});

document.querySelector("#close-share").addEventListener("click", () => dialog.close());

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(sharePreview.textContent);
    feedback.textContent = "Copied for you. Nothing was sent.";
    showToast("Update copied · nothing was sent");
  } catch {
    feedback.textContent = "Clipboard access is unavailable. You can select and copy the preview text.";
  }
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

async function initialize() {
  try {
    await mcp.connect();
    const result = await mcp.callTool("get_evening_plan");
    plan = result.plan;
    renderChangeLog(result.lastUpdate
      ? { ...result.lastUpdate, canUndo: result.canUndo }
      : null);
    renderTimeline();
    setConnectionStatus(true);
  } catch (error) {
    setConnectionStatus(false);
    addConversationMessage(
      "assistant",
      `The local MCP service isn't connected. The plan is unchanged. Start it with npm start, then reload. ${error instanceof Error ? error.message : String(error)}`,
      "MCP offline · No changes made",
    );
  }
}

void initialize();
