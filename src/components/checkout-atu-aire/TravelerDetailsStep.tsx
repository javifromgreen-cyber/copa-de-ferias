import { TRAVELER_FIELD_LABELS } from "@/lib/checkout/travelerFields";
import { COUNTRIES } from "@/lib/checkout-atu-aire/countries";

export type AtuAireTravelerFormState = {
  firstName: string;
  lastName: string;
  birthDate: string;
  nationality: string;
  docType: "dni" | "passport" | "";
  docNumber: string;
  docExpiry: string;
  docCountry: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export function emptyAtuAireTraveler(): AtuAireTravelerFormState {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    nationality: "",
    docType: "",
    docNumber: "",
    docExpiry: "",
    docCountry: "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  };
}

function travelerFieldValue(t: AtuAireTravelerFormState, key: string): string {
  switch (key) {
    case "birthDate":
      return t.birthDate;
    case "nationality":
      return t.nationality;
    case "docType":
      return t.docType;
    case "docNumber":
      return t.docNumber;
    case "docExpiry":
      return t.docExpiry;
    case "docCountry":
      return t.docCountry;
    case "phone":
      return t.phone;
    default:
      return "";
  }
}

/**
 * True only when EVERY traveler in the party has name/lastname plus every
 * field this trip requires (§15) — contact-only (the buyer form) is never
 * enough on its own to unlock payment.
 */
export function isAtuAireTravelersComplete(travelers: AtuAireTravelerFormState[], requiredFields: string[]): boolean {
  return travelers.every((t) => {
    if (!t.firstName.trim() || !t.lastName.trim()) return false;
    for (const key of requiredFields) {
      if (key === "emergencyContact") {
        if (!t.emergencyContactName.trim() || !t.emergencyContactPhone.trim()) return false;
        continue;
      }
      if (!travelerFieldValue(t, key).trim()) return false;
    }
    return true;
  });
}

/**
 * Renders exactly N fieldsets for N travelers (§15) — reuses the same
 * requiredTravelerFields config and field labels GROUP_CDF's CheckoutFlow
 * already uses, so a trip's field requirements mean the same thing in
 * both travel modes.
 */
export function TravelerDetailsStep({
  travelers,
  requiredFields,
  onChange,
}: {
  travelers: AtuAireTravelerFormState[];
  requiredFields: string[];
  onChange: (index: number, patch: Partial<AtuAireTravelerFormState>) => void;
}) {
  const req = (key: string) => requiredFields.includes(key);
  const hasDocGroup = req("docType") || req("docNumber") || req("docExpiry") || req("docCountry");
  const hasContactGroup = req("phone") || req("emergencyContact");

  return (
    <section aria-labelledby="traveler-details-heading" className="space-y-4 rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="traveler-details-heading" className="text-lg font-semibold">
        Datos de cada viajero
      </h2>
      <div className="space-y-5">
        {travelers.map((t, i) => (
          <fieldset key={i} className="space-y-4 rounded-sm border border-carbon/15 p-4">
            <legend className="px-1 text-sm font-medium">Viajero {i + 1}</legend>

            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Datos personales</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs tracking-wide uppercase">Nombre *</span>
                  <input
                    value={t.firstName}
                    onChange={(e) => onChange(i, { firstName: e.target.value })}
                    className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs tracking-wide uppercase">Apellidos *</span>
                  <input
                    value={t.lastName}
                    onChange={(e) => onChange(i, { lastName: e.target.value })}
                    className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                    required
                  />
                </label>
                {req("birthDate") ? (
                  <label className="block">
                    <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.birthDate} *</span>
                    <input
                      type="date"
                      value={t.birthDate}
                      onChange={(e) => onChange(i, { birthDate: e.target.value })}
                      className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                ) : null}
                {req("nationality") ? (
                  <label className="block">
                    <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.nationality} *</span>
                    <select
                      value={t.nationality}
                      onChange={(e) => onChange(i, { nationality: e.target.value })}
                      className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            {hasDocGroup ? (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Documentación</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {req("docType") ? (
                    <label className="block">
                      <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.docType} *</span>
                      <select
                        value={t.docType}
                        onChange={(e) => onChange(i, { docType: e.target.value as AtuAireTravelerFormState["docType"] })}
                        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Selecciona</option>
                        <option value="dni">DNI</option>
                        <option value="passport">Pasaporte</option>
                      </select>
                    </label>
                  ) : null}
                  {req("docNumber") ? (
                    <label className="block">
                      <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.docNumber} *</span>
                      <input
                        value={t.docNumber}
                        onChange={(e) => onChange(i, { docNumber: e.target.value })}
                        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  ) : null}
                  {req("docExpiry") ? (
                    <label className="block">
                      <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.docExpiry} *</span>
                      <input
                        type="date"
                        value={t.docExpiry}
                        onChange={(e) => onChange(i, { docExpiry: e.target.value })}
                        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  ) : null}
                  {req("docCountry") ? (
                    <label className="block">
                      <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.docCountry} *</span>
                      <input
                        value={t.docCountry}
                        onChange={(e) => onChange(i, { docCountry: e.target.value })}
                        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasContactGroup ? (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Contacto</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {req("phone") ? (
                    <label className="block">
                      <span className="mb-1 block text-xs tracking-wide uppercase">{TRAVELER_FIELD_LABELS.phone} *</span>
                      <input
                        value={t.phone}
                        onChange={(e) => onChange(i, { phone: e.target.value })}
                        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  ) : null}
                  {req("emergencyContact") ? (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-xs tracking-wide uppercase">Contacto de emergencia — nombre *</span>
                        <input
                          value={t.emergencyContactName}
                          onChange={(e) => onChange(i, { emergencyContactName: e.target.value })}
                          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs tracking-wide uppercase">Contacto de emergencia — teléfono *</span>
                        <input
                          value={t.emergencyContactPhone}
                          onChange={(e) => onChange(i, { emergencyContactPhone: e.target.value })}
                          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </fieldset>
        ))}
      </div>
    </section>
  );
}
