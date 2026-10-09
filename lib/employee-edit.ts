import { employeeState } from "./employee-status";
import { contactPhone, contactEmail } from "./employee-contacts";

export function employeeEditPayload(body: Record<string, any>) {
  const text = (value: unknown) => String(value ?? "").trim();
  const nik = text(body.nik), name = text(body.name);
  if (!nik || !name || nik.length > 80 || name.length > 250) throw new Error("NIK dan nama karyawan wajib diisi dengan benar.");
  const result: Record<string, any> = { nik, name, ...employeeState(body) };
  if (Object.hasOwn(body, "employment_type")) {
    if (!["permanent", "contract", "outsource", "unknown"].includes(String(body.employment_type))) throw new Error("Status kepegawaian tidak valid.");
    result.employment_type = body.employment_type;
  }
  if (body._originalNik) {
    result.original_nik = text(body._originalNik);
    if (result.original_nik.length > 80) throw new Error("NIK asal tidak valid.");
  }
  if (Object.hasOwn(body, "phone")) result.phone = contactPhone(body.phone);
  if (Object.hasOwn(body, "email")) result.email = contactEmail(body.email);
  for (const field of ["position", "dept", "hub", "level", "superior"]) {
    result[field] = text(body[field]);
    if (result[field].length > 250) throw new Error("Isian karyawan maksimal 250 karakter.");
  }
  if (Object.hasOwn(body, "tgrid")) {
    result.tgrid = text(body.tgrid).toUpperCase();
    if (result.tgrid && !/^TGR(?:FL)?[A-Z0-9]+$/.test(result.tgrid)) throw new Error("TGR ID harus berupa TGR/TGRFL diikuti nomor atau huruf, tanpa spasi.");
    if (result.tgrid.length > 80) throw new Error("TGR ID terlalu panjang.");
  }
  return result;
}
