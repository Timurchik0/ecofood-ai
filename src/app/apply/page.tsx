import ApplyForm from "@/components/ApplyForm";

export const metadata = { title: "Анкета для предприятий — EcoFood AI" };

export default function ApplyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Исследование практики обращения с пищевыми отходами</h1>
      <p className="mt-2 text-sm text-slate-600">
        Помогите нам создать решение, которое позволит пищевым предприятиям сократить расходы на вывоз отходов,
        направляя их на переработку вместо полигона. Заполнение займёт 2–3 минуты.
      </p>
      <div className="mt-6">
        <ApplyForm />
      </div>
    </div>
  );
}
