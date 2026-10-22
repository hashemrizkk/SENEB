import assert from "node:assert/strict";
import { indexedKey } from "../lib/react-keys.ts";

const keys = ["R3", "R3", "R4"].map(indexedKey);
assert.deepEqual(keys, ["R3-0", "R3-1", "R4-2"]);
assert.equal(new Set(keys).size, keys.length);
console.log("PASS  repeated priority rule IDs produce unique React keys");
