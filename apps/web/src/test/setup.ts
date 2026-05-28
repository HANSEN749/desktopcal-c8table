import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:desktopcal-test";
}

if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => undefined;
}
