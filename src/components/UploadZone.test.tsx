import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { UploadZone } from "./UploadZone";

beforeEach(() =>
  vi
    .spyOn(api, "notificationSettings")
    .mockResolvedValue({ sender: "sender@example.test", defaultRecipient: "default@example.test" }),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const onSubir = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UploadZone onSubir={onSubir} />
    </QueryClientProvider>,
  );
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["xlsx"], "products.xlsx")] },
  });
  return onSubir;
}
it("shows the configured sender and submits the chosen recipients", async () => {
  const onSubir = setup();
  expect(await screen.findByText("sender@example.test")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Destinatarios de esta carga (opcional)"), {
    target: { value: "first@example.test; second@example.test, FIRST@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));
  await waitFor(() =>
    expect(onSubir).toHaveBeenCalledWith(expect.any(File), [
      "first@example.test",
      "second@example.test",
    ]),
  );
});
it("prevents uploading with an invalid recipient", async () => {
  const onSubir = setup();
  fireEvent.change(screen.getByLabelText("Destinatarios de esta carga (opcional)"), {
    target: { value: "invalid-email" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("correos válidos");
  expect(onSubir).not.toHaveBeenCalled();
});
