import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialPlan,
  createSharePreview,
  describePlanChanges,
  planFromRequest,
} from "../src/home-orchestrator.js";
import { createSpeechRecognition, getRecognitionConstructor, isUndoRequest } from "../src/voice-input.js";

test("late pickup shifts dinner and updates the timer without mutating the original plan", () => {
  const original = createInitialPlan();
  const { plan, reply } = planFromRequest(original, "The bus is running late");

  assert.equal(original.events[0].time, "5:15");
  assert.equal(plan.events[0].time, "5:27");
  assert.equal(plan.events[1].time, "5:42");
  assert.match(plan.timer, /Paused/);
  assert.match(reply, /12 minutes late/);
});

test("arrival request readies the entry while preserving the private reminder", () => {
  const { plan, reply } = planFromRequest(createInitialPlan(), "Nana is coming at six");

  assert.equal(plan.events.find((event) => event.id === "nana").state, "Ready");
  assert.equal(plan.entryLight, "On · arrival at 6");
  assert.equal(plan.privateReminder, "Take a quiet moment before dinner.");
  assert.match(reply, /personal reminders stay private/i);
});

test("quiet-time request creates a reset and pauses the kitchen timer", () => {
  const { plan, reply } = planFromRequest(createInitialPlan(), "I need ten quiet minutes");

  assert.equal(plan.events.find((event) => event.id === "dinner").time, "5:40");
  assert.match(plan.timer, /10-minute reset/);
  assert.match(reply, /ten quiet minutes/);
});

test("share preview contains household events but excludes private reminder details", () => {
  const plan = createInitialPlan();
  const preview = createSharePreview(plan);

  assert.match(preview, /School pickup/);
  assert.match(preview, /Nana comes by/);
  assert.doesNotMatch(preview, /quiet moment|private/i);
  assert.match(preview, /Review this before sharing/);
});

test("unsupported requests receive an explicit prompt and leave plan unchanged", () => {
  const original = createInitialPlan();
  const result = planFromRequest(original, "What is the weather tomorrow?");

  assert.equal(result.plan, original);
  assert.equal(result.updated, false);
  assert.match(result.reply, /try telling me/i);
});

test("change summaries show shared timeline and device changes without private reminders", () => {
  const initial = createInitialPlan();
  const { plan } = planFromRequest(initial, "The bus is running late");
  const changes = describePlanChanges(initial, plan);

  assert.equal(changes.length, 3);
  assert.match(changes[0], /School pickup.*5:15 PM.*5:27 PM/);
  assert.match(changes[1], /Dinner together.*5:30 PM.*5:42 PM/);
  assert.match(changes[2], /Kitchen timer/);
  assert.doesNotMatch(changes.join(" "), /quiet moment|private reminder/i);
});

test("undo voice and text prompts are recognized without matching unrelated requests", () => {
  assert.equal(isUndoRequest("Undo last change"), true);
  assert.equal(isUndoRequest("Please reverse the most recent plan update."), true);
  assert.equal(isUndoRequest("roll back"), true);
  assert.equal(isUndoRequest("Hey Hearth, can you undo the last change?"), true);
  assert.equal(isUndoRequest("undo the last change and tell me the weather"), false);
  assert.equal(isUndoRequest("the bus is late"), false);
});

test("speech recognition is opt-in, single-utterance, and exposes interim and final text", () => {
  const callbacks = [];
  class FakeRecognition {
    start() { callbacks.push("started"); }
    stop() { callbacks.push("stopped"); }
  }
  const recognition = createSpeechRecognition({
    onStart: () => callbacks.push("recognition-started"),
    onError: (error) => callbacks.push(`error:${error}`),
    onEnd: () => callbacks.push("recognition-ended"),
    onTranscript: (result) => callbacks.push(result),
  }, FakeRecognition);

  assert.equal(recognition.lang, "en-US");
  assert.equal(recognition.continuous, false);
  assert.equal(recognition.interimResults, true);
  recognition.onstart();
  recognition.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "The bus is late" }], { isFinal: false })],
  });
  recognition.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "The bus is late." }], { isFinal: true })],
  });
  recognition.start();
  recognition.stop();
  recognition.onerror({ error: "no-speech" });
  recognition.onend();

  assert.deepEqual(callbacks, [
    "recognition-started",
    { transcript: "The bus is late", isFinal: false },
    { transcript: "The bus is late.", isFinal: true },
    "started",
    "stopped",
    "error:no-speech",
    "recognition-ended",
  ]);
});

test("speech recognition cleanly reports unsupported browsers", () => {
  assert.equal(createSpeechRecognition({}, null), null);
  assert.equal(getRecognitionConstructor({}), null);
  class WebKitRecognition {}
  assert.equal(getRecognitionConstructor({ webkitSpeechRecognition: WebKitRecognition }), WebKitRecognition);
});
