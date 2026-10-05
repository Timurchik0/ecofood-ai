"use server";

import { revalidatePath } from "next/cache";
import { demoReadonly, isAdmin } from "@/lib/admin";
import { isStatusId } from "@/lib/config";
import { setNote, setStatus } from "@/lib/leads";
import { runAi } from "@/lib/ai";

async function canEdit() {
  return !demoReadonly() || (await isAdmin());
}

export async function changeStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(id) || !isStatusId(status) || !(await canEdit())) return;
  await setStatus(id, status);
  revalidatePath(`/leads/${id}`);
  revalidatePath("/");
}

export async function saveNote(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || !(await canEdit())) return;
  await setNote(id, String(formData.get("note") ?? ""));
  revalidatePath(`/leads/${id}`);
}

/** Перегенерация AI-заметки стоит денег, поэтому — только админу. */
export async function regenerateAi(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || !(await isAdmin())) return;
  await runAi(id);
  revalidatePath(`/leads/${id}`);
  revalidatePath("/");
}
