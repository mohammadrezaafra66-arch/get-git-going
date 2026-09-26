export function honorificForPerson(input: {
  displayName: string;
  kind?: string | null;
}): string {
  const name = input.displayName.trim();
  if (!name) return "";
  if (input.kind === "organization") return "";
  if (/(^|\s)خانم\s/.test(name) || name.startsWith("خانم")) return "خانم";
  if (/(^|\s)آقای\s/.test(name) || name.startsWith("آقا")) return "آقای";
  return "آقای";
}

export function didarDealTitleFromPerson(input: {
  displayName: string;
  kind?: string | null;
}): string {
  const name = input.displayName.trim();
  if (!name) return "";
  if (name.startsWith("معامله ")) return name;
  if (input.kind === "organization") return `معامله ${name}`;
  const h = honorificForPerson(input);
  const stripped = name
    .replace(/^خانم\s+/, "")
    .replace(/^آقای\s+/, "")
    .replace(/^آقا\s+/, "")
    .trim();
  return h ? `معامله ${h} ${stripped}` : `معامله ${stripped}`;
}

export function dealHeaderTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "معامله";
  if (t.startsWith("معامله")) return t;
  return `معامله ${t}`;
}
