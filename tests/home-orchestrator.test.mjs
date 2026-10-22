import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialPlan,
  createSharePreview,
  describePlanChanges,
  addActivity,
  addPrivateNote,
  deleteLastPrivateNote,
  planFromRequest,
  removeActivity,
} from "../src/home-orchestrator.js";
import {
  classifyPrompt,
  parseActivityRemoval,
  parseActivityRequest,
  parseNoteRequest,
  summarizeEveningPlan,
} from "../src/prompt-commands.js";
import { createSpeechRecognition, getRecognitionConstructor } from "../src/voice-input.js";

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

test("spoken and typed prompts route to explicit plan, preview, undo, reset, and help actions", () => {
  assert.equal(classifyPrompt("Hey Hearth, what’s on tonight?"), "show-plan");
  assert.equal(classifyPrompt("Read me the plan"), "show-plan");
  assert.equal(classifyPrompt("Could you prepare a family update?"), "preview-update");
  assert.equal(classifyPrompt("Hey Hearth, can you undo the last change?"), "undo");
  assert.equal(classifyPrompt("Please start over"), "reset-demo");
  assert.equal(classifyPrompt("What can you do?"), "help");
  assert.equal(classifyPrompt("undo the last change and tell me the weather"), "adjust-plan");
  assert.equal(classifyPrompt("the bus is late"), "adjust-plan");
});

test("spoken plan summary contains shared events and excludes personal reminder", () => {
  const { plan } = planFromRequest(createInitialPlan(), "The bus is running late.");
  const summary = summarizeEveningPlan(plan);

  assert.match(summary, /Pickup is running late/);
  assert.match(summary, /Dinner, when you’re ready/);
  assert.doesNotMatch(summary, /quiet moment|private reminder/i);
});

test("voice prompts parse private notes and activities without leaking note text", () => {
  assert.equal(classifyPrompt("Add a note that I need milk"), "add-note");
  assert.equal(parseNoteRequest("Add a note that I need milk"), "I need milk");
  assert.equal(classifyPrompt("Please remember to call the clinic tomorrow"), "add-note");
  assert.equal(parseNoteRequest("Please remember to call the clinic tomorrow"), "call the clinic tomorrow");
  assert.equal(classifyPrompt("Show my notes"), "list-notes");
  assert.equal(classifyPrompt("Delete the last note"), "delete-note");
  assert.equal(classifyPrompt("Schedule a neighborhood walk at 7 PM"), "add-activity");
  assert.deepEqual(parseActivityRequest("Schedule a neighborhood walk at 7 PM"), {
    title: "neighborhood walk",
    time: "07:00",
    period: "PM",
  });
  assert.deepEqual(parseActivityRequest("Add the dentist visit at 10:30 AM"), {
    title: "dentist visit",
    time: "10:30",
    period: "AM",
  });
  assert.deepEqual(parseActivityRequest("Add a neighborhood walk"), {
    title: "neighborhood walk",
    time: null,
    period: null,
  });
  assert.equal(classifyPrompt("Remove activity Neighborhood walk"), "remove-activity");
  assert.equal(parseActivityRemoval("Remove activity Neighborhood walk"), "Neighborhood walk");
});

test("private notes stay out of shared events and activity changes are undoable", () => {
  const initial = createInitialPlan();
  const withNote = addPrivateNote(initial, "Pick up the blue folder after school.");
  assert.equal(withNote.updated, true);
  assert.equal(withNote.plan.privateNotes[0].text, "Pick up the blue folder after school.");
  assert.equal(initial.privateNotes.length, 0);
  assert.doesNotMatch(createSharePreview(withNote.plan), /blue folder/i);

  const withActivity = addActivity(withNote.plan, {
    title: "Neighborhood walk",
    time: "07:00",
    period: "PM",
  });
  assert.equal(withActivity.plan.events.at(-1).title, "Neighborhood walk");
  const activityChanges = describePlanChanges(withNote.plan, withActivity.plan);
  assert.equal(activityChanges.filter((change) => change.startsWith("Activity added:")).length, 1);

  const withoutActivity = removeActivity(withActivity.plan, "Neighborhood walk");
  assert.equal(withoutActivity.plan.events.some((event) => event.title === "Neighborhood walk"), false);
  assert.equal(deleteLastPrivateNote(withoutActivity.plan).plan.privateNotes.length, 0);
  assert.match(
    describePlanChanges(withoutActivity.plan, deleteLastPrivateNote(withoutActivity.plan).plan).join(" "),
    /Private note removed/,
  );
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
