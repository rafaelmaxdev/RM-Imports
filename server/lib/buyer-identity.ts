const INVALID_EMAIL = "Informe um e-mail válido.";
const INVALID_CPF = "Informe um CPF válido.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function cpfCheckDigit(digits: string, weight: number): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]) * (weight - i);
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function hasEmailForbiddenCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return character.trim() === "" || code < 0x20 || (code >= 0x7f && code <= 0x9f);
  });
}

export function normalizeBuyerIdentity(input: unknown): { email: string; cpf: string } {
  if (!isRecord(input)) throw new Error(INVALID_EMAIL);

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email || email.length > 254 || hasEmailForbiddenCharacters(email) || !EMAIL_PATTERN.test(email)) {
    throw new Error(INVALID_EMAIL);
  }

  const cpfInput = typeof input.cpf === "string" ? input.cpf.trim() : "";
  if (!cpfInput || !/^[0-9.-]+$/.test(cpfInput)) throw new Error(INVALID_CPF);

  const cpf = cpfInput.replace(/[.-]/g, "");
  if (
    !/^\d{11}$/.test(cpf) ||
    /^([0-9])\1{10}$/.test(cpf) ||
    cpfCheckDigit(cpf.slice(0, 9), 10) !== Number(cpf[9]) ||
    cpfCheckDigit(cpf.slice(0, 10), 11) !== Number(cpf[10])
  ) {
    throw new Error(INVALID_CPF);
  }

  return { email, cpf };
}
