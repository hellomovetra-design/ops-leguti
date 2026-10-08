export function contactPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parts = raw.replace(/\((?:wa|kerja)\)/gi, "").split("/");
  if (parts.length > 3) throw new Error("Maksimal tiga nomor telepon, dipisahkan /.");
  const phones = parts.map(part => part.trim().replace(/[\s().-]/g, ""));
  if (phones.some(phone => !/^\+?\d{8,16}$/.test(phone))) throw new Error("Nomor telepon harus 8–16 digit. Pisahkan beberapa nomor dengan /.");
  return [...new Set(phones)].join(" / ");
}

export function contactEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Format email kontak tidak valid.");
  return email;
}

// Display legacy data safely; an invalid contact must never become a link.
export function whatsappContacts(value: unknown) {
  try {
    const phones = contactPhone(value);
    if (!phones) return [];
    return phones.split(" / ").flatMap(label => {
      let digits = label.replace(/^\+/, "");
      if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
      else if (digits.startsWith("8")) digits = `62${digits}`;
      if (!/^[1-9]\d{7,14}$/.test(digits)) return [];
      return [{ label, href: `https://wa.me/${digits}` }];
    });
  } catch { return []; }
}

export function emailContact(value: unknown) {
  try {
    const label = contactEmail(value);
    return label ? { label, href: `mailto:${encodeURIComponent(label)}` } : null;
  } catch { return null; }
}
