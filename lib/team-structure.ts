export type TeamPerson = { nik: string; name: string; position: string; dept: string; hub: string; superior: string; active: boolean; photo_url?: string };
export const DEFAULT_TEAM_PHOTO = "/default-employee.jpg";
// Requested display overrides for Adhitya, Giga and Budi; keep stored uploads intact.
const cartoonPhotoNiks = new Set(["14010441", "15110895", "11050113"]);
export function teamPhoto(person?: TeamPerson) {
  return !person || cartoonPhotoNiks.has(person.nik) ? DEFAULT_TEAM_PHOTO : person.photo_url || DEFAULT_TEAM_PHOTO;
}
export const normalizeTeamName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export const isTeamSupervisor = (person: TeamPerson) => /\b(spv|supervisor)\b/i.test(person.position) && !/\b(jr|junior|kurir|motor|mobil)\b/i.test(person.position);
export function teamManagement(rows: TeamPerson[]) {
  const active = rows.filter(person => person.active);
  const junior = active.find(person => /\b(jr|junior)\b/i.test(person.position) && /\b(spv|supervisor)\b/i.test(person.position));
  const supervisors = active.filter(isTeamSupervisor);
  const superior = junior && supervisors.find(person => normalizeTeamName(person.name) === normalizeTeamName(junior.superior));
  return { junior, supervisor: superior || (supervisors.length === 1 ? supervisors[0] : undefined) };
}
export function teamChildren(rows: TeamPerson[], parent: TeamPerson) {
  return rows.filter(person => person.nik !== parent.nik && normalizeTeamName(person.superior) === normalizeTeamName(parent.name));
}
