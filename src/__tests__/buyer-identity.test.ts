import { describe, expect, it } from "vitest";
import { normalizeBuyerIdentity } from "../../server/lib/buyer-identity";

const validEmail = "Buyer@example.com";
const validCpf = "52998224725";

describe("normalizeBuyerIdentity", () => {
  it("normalizes a valid buyer identity and preserves the email local-part case", () => {
    expect(normalizeBuyerIdentity({ email: `  ${validEmail} `, cpf: "529.982.247-25" })).toEqual({
      email: validEmail,
      cpf: validCpf,
    });
  });

  it.each([
    ["repeated digits", "11111111111"],
    ["wrong check digits", "52998224726"],
    ["letters", "529.982.247-2A"],
  ])("rejects CPF with %s", (_case, cpf) => {
    expect(() => normalizeBuyerIdentity({ email: validEmail, cpf })).toThrow("Informe um CPF válido.");
  });

  it("rejects a non-object input", () => {
    expect(() => normalizeBuyerIdentity(null)).toThrow("Informe um e-mail válido.");
    expect(() => normalizeBuyerIdentity("buyer@example.com")).toThrow("Informe um e-mail válido.");
  });

  it.each([
    ["injection", "buyer@example.com\nBcc: attacker@example.com"],
    ["whitespace", "buyer name@example.com"],
    ["oversized", `${"a".repeat(243)}@example.com`],
    ["missing domain", "buyer@"],
  ])("rejects email with %s", (_case, email) => {
    expect(() => normalizeBuyerIdentity({ email, cpf: validCpf })).toThrow("Informe um e-mail válido.");
  });
});
