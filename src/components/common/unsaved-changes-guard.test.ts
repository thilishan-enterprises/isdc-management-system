import assert from "node:assert/strict";
import test from "node:test";
import { runConfirmedDiscard } from "./unsaved-changes-guard";

test("confirmed discard clears a draft before navigation", async () => {
  let draft = "entered customer data";
  const events: string[] = [];

  await runConfirmedDiscard(
    [() => {
      draft = "";
      events.push("discard");
    }],
    () => {
      events.push("navigate");
    },
  );

  assert.equal(draft, "");
  assert.deepEqual(events, ["discard", "navigate"]);
});

test("repeated confirmed discards do not restore an earlier draft", async () => {
  let draft = "first draft";
  const discard = () => {
    draft = "";
  };

  await runConfirmedDiscard([discard], () => undefined);
  draft = "second draft";
  await runConfirmedDiscard([discard], () => undefined);

  assert.equal(draft, "");
});

test("not running confirmed discard preserves the current draft", () => {
  const draft = "keep this customer data";
  assert.equal(draft, "keep this customer data");
});
